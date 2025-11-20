"""Celery task responsible for running analysis on a single video."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
import yt_dlp
from yt_dlp.utils import DownloadError
from celery import shared_task
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from ..config import settings
from ..postgres import get_conn
from ..redis_client import get_redis

logger = logging.getLogger(__name__)
logger.setLevel(settings.log_level)


@shared_task(name="doomscroller_pipeline.tasks.analyzer.process_video", queue="analyze")
def process_video(
    platform: str,
    video_id: str,
    url: str,
    *,
    title: Optional[str] = None,
    channel: Optional[str] = None,
    published_at: Optional[str] = None,
    region: Optional[str] = None,
    views_per_hour: Optional[float] = None,
    **_: Any,
) -> None:
    redis = get_redis()
    dedupe_key = _dedupe_key(platform, video_id)

    logger.info("Claiming task for %s:%s", platform, video_id)
    acquired = redis.set(
        dedupe_key,
        1,
        nx=True,
        ex=settings.idempotency_ttl_seconds,
    )
    if not acquired:
        logger.info("Skip %s:%s (already processing or fresh)", platform, video_id)
        return

    started_at = time.perf_counter()
    succeeded = False

    try:
        # Call resolver service for frame extraction + inference
        logger.info("Calling resolver service at %s for %s:%s", settings.resolver_url, platform, video_id)
        try:
            resolver_response = requests.post(
                f"{settings.resolver_url}/analyze",
                json={
                    "url": url,
                    "title": title,
                    "channel": channel,
                    "target_frames": settings.infer_target_frames,
                    "timeout": settings.frame_extract_timeout
                },
                timeout=settings.frame_extract_timeout + 30  # Add buffer for network latency
            )
            resolver_response.raise_for_status()
            resolver_data = resolver_response.json()

            if not resolver_data.get("success"):
                error_msg = resolver_data.get("error", "Unknown resolver error")
                raise RuntimeError(f"Resolver failed: {error_msg}")

            inference = resolver_data["inference"]
            frames_count = resolver_data.get("frames_count", 0)
            logger.info("Resolver completed successfully for %s:%s, received inference results with %d frames", platform, video_id, frames_count)

        except requests.exceptions.RequestException as exc:
            logger.error("Failed to connect to resolver service for %s:%s: %s", platform, video_id, exc)
            raise RuntimeError(f"Resolver service unavailable: {str(exc)}")
        (
            vote_share,
            label,
            confidence,
            reason,
            aggregate_features,
        ) = _aggregate(inference, title=title, channel=channel)
        logger.info(
            "Inference complete for %s:%s label=%s confidence=%.4f",
            platform,
            video_id,
            label,
            confidence,
        )

        logger.info("Upserting Postgres rows for %s:%s", platform, video_id)
        _upsert_results(
            platform=platform,
            video_id=video_id,
            label=label,
            confidence=confidence,
            vote_share=vote_share,
            batch_time_ms=inference.get("batch_time_ms"),
            frames_count=frames_count,
            title=title,
            channel=channel,
            published_at=published_at,
            region=region,
            source_url=url,
            reason=reason,
            aggregate_features=aggregate_features,
            views_per_hour=views_per_hour,
        )

        logger.info("Writing Redis cache for %s:%s", platform, video_id)
        _cache_result(
            platform=platform,
            video_id=video_id,
            label=label,
            confidence=confidence,
            vote_share=vote_share,
            analyzed_at=datetime.now(timezone.utc),
            model_version="doom_v1",
            title=title,
            channel=channel,
            published_at=published_at,
            region=region,
            source_url=url,
            reason=reason,
            views_per_hour=views_per_hour,
        )
        succeeded = True
    except Exception:
        redis.delete(dedupe_key)
        logger.exception("Failed to process %s:%s", platform, video_id)
        raise
    finally:
        duration = (time.perf_counter() - started_at) * 1000
        logger.info("Processed %s:%s in %.1f ms", platform, video_id, duration)
        if succeeded:
            redis.expire(dedupe_key, settings.idempotency_stamp_ttl_seconds)
        


def _dedupe_key(platform: str, video_id: str) -> str:
    return f"analyzed:{platform}:{video_id}@doom_v1@even_{settings.infer_target_frames}"


# ==============================================================================
# ROBUST FRAME EXTRACTION PIPELINE
# ==============================================================================
# Fast path: yt-dlp pipe → ffmpeg stdin (keeps speed)
# Fallback A: Stricter progressive format
# Fallback B: Direct URL → ffmpeg with headers
# Fallback C: Temp file download
# ==============================================================================

from enum import Enum
import threading
from typing import Tuple


class ErrorClass(Enum):
    """Classification of frame extraction errors."""
    HLS_PARSE = "hls_parse"
    AUTH_REQUIRED = "auth_required"
    FORBIDDEN_403 = "forbidden_403"
    RATE_LIMIT = "rate_limit"
    UNKNOWN = "unknown"


def _classify_error(stderr: str) -> ErrorClass:
    """Classify error from ffmpeg/yt-dlp stderr."""
    stderr_lower = stderr.lower()

    if "403" in stderr_lower or "forbidden" in stderr_lower:
        return ErrorClass.FORBIDDEN_403
    if "401" in stderr_lower or "unauthorized" in stderr_lower:
        return ErrorClass.AUTH_REQUIRED
    if "429" in stderr_lower or "rate limit" in stderr_lower:
        return ErrorClass.RATE_LIMIT
    if "m3u8" in stderr_lower or "hls" in stderr_lower or "dash" in stderr_lower:
        return ErrorClass.HLS_PARSE

    return ErrorClass.UNKNOWN


def _compute_fps(duration: float, target_frames: int) -> float:
    """Compute FPS to extract target_frames evenly across duration."""
    duration = max(duration, 0.001)
    return max(target_frames / duration, 0.01)


def _get_cookie_config() -> Tuple[str, str]:
    """Get cookie configuration from environment.
    Returns (mode, value) where mode is 'file', 'browser', or 'none'.
    """
    cookies_file = os.getenv("YTDLP_COOKIES_FILE")
    cookies_browser = os.getenv("YTDLP_COOKIES_BROWSER")

    if cookies_file:
        return ("file", cookies_file)
    elif cookies_browser:
        return ("browser", cookies_browser)
    else:
        return ("none", "")


def _probe_metadata_robust(url: str) -> Tuple[float, Dict[str, str]]:
    """Probe video metadata to get duration and headers.
    Returns (duration, http_headers).
    """
    cookie_mode, cookie_value = _get_cookie_config()
    logger.info("Cookie mode: %s", cookie_mode)

    ydl_opts = {
        "format": "bestvideo*[protocol^=http][ext=mp4]/best[protocol^=http][ext=mp4]/best[protocol^=http]",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 10,
        "retries": 2,
        "ignore_no_formats_error": True,
    }

    if cookie_mode == "file":
        ydl_opts["cookiefile"] = cookie_value
    elif cookie_mode == "browser":
        ydl_opts["cookiesfrombrowser"] = (cookie_value,)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            # Handle playlist wrappers
            if info.get("_type") == "playlist":
                entries = info.get("entries") or []
                if entries:
                    info = entries[0]

            # Extract duration (try multiple keys)
            duration = 0.0
            for key in ["duration", "duration_float", "duration_seconds"]:
                val = info.get(key)
                if val and float(val) > 0:
                    duration = float(val)
                    break

            # Fallback to target_frames if no duration found
            if duration <= 0:
                duration = float(settings.infer_target_frames)
                logger.info("No duration found, using target_frames as fallback: %.1f", duration)

            headers = info.get("http_headers", {}) or {}

            logger.info("Probed metadata: duration=%.2fs", duration)

            return (duration, headers)

    except Exception as exc:
        logger.warning("Metadata probe failed: %s, using defaults", exc)
        return (float(settings.infer_target_frames), {})


def _build_yt_dlp_command_robust(url: str, format_selector: str) -> List[str]:
    """Build yt-dlp command for streaming to stdout."""
    cookie_mode, cookie_value = _get_cookie_config()

    cmd = [
        "yt-dlp",
        "-f", format_selector,
        "--hls-use-mpegts",
        "--retries", "5",
        "--fragment-retries", "10",
        "--concurrent-fragments", "5",
        "--no-part",
        "--quiet",
        "--no-warnings",
        "-o", "-",
        url,
    ]

    if cookie_mode == "file":
        cmd.extend(["--cookies", cookie_value])
    elif cookie_mode == "browser":
        cmd.extend(["--cookies-from-browser", cookie_value])

    return cmd


def _build_ffmpeg_command_robust(duration: float, target_frames: int, output_pattern: Path) -> List[str]:
    """Build ffmpeg command for extracting frames from stdin."""
    fps = _compute_fps(duration, target_frames)

    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-i", "pipe:0",
        "-an",
        "-vf", f"fps=fps={fps:.8f}:round=up,scale=-2:1080:force_original_aspect_ratio=decrease",
        "-vsync", "vfr",
        "-frames:v", str(target_frames),
        "-q:v", "2",
        str(output_pattern),
    ]


def _drain_stderr(proc: subprocess.Popen, output_list: List[str]):
    """Thread function to drain stderr from a subprocess to avoid deadlock."""
    try:
        if proc.stderr:
            for line in iter(proc.stderr.readline, b""):
                output_list.append(line.decode("utf-8", errors="ignore"))
    except Exception:
        pass


def _try_fast_path_robust(url: str, target_frames: int, duration: float, format_selector: str, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Try fast path: yt-dlp pipe → ffmpeg stdin.
    Returns (success, error_message).
    """
    output_pattern = tmpdir / "frame_%03d.jpg"

    yt_cmd = _build_yt_dlp_command_robust(url, format_selector)
    ff_cmd = _build_ffmpeg_command_robust(duration, target_frames, output_pattern)

    logger.info("Fast path attempt with format: %s", format_selector[:50])

    ydl_stderr_lines: List[str] = []

    try:
        ydl_proc = subprocess.Popen(yt_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        return (False, "yt-dlp executable not found on PATH")

    # Start thread to drain yt-dlp stderr
    stderr_thread = threading.Thread(target=_drain_stderr, args=(ydl_proc, ydl_stderr_lines), daemon=True)
    stderr_thread.start()

    try:
        try:
            result = subprocess.run(
                ff_cmd,
                stdin=ydl_proc.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
                timeout=timeout,
            )
        except FileNotFoundError:
            ydl_proc.kill()
            return (False, "ffmpeg executable not found on PATH")
        except subprocess.TimeoutExpired:
            ydl_proc.kill()
            return (False, "ffmpeg timed out while extracting frames")
        except subprocess.CalledProcessError as exc:
            ydl_proc.kill()
            stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else ""
            return (False, f"ffmpeg failed: {stderr.strip()}")
    finally:
        if ydl_proc.stdout:
            ydl_proc.stdout.close()
        try:
            ydl_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            ydl_proc.kill()
            ydl_proc.wait(timeout=5)

        stderr_thread.join(timeout=1)

    # Check if frames were produced
    frame_files = sorted(tmpdir.glob("frame_*.jpg"))
    if not frame_files:
        ydl_stderr = "".join(ydl_stderr_lines)
        return (False, f"No frames produced. yt-dlp stderr: {ydl_stderr[:500]}")

    return (True, "")


def _select_media_format(info: Dict[str, Any]) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
    """Select best media format and return (url, headers, format_info)."""
    if "entries" in info and info["entries"]:
        info = info["entries"][0]

    headers = info.get("http_headers", {}) or {}

    # Try requested_formats first
    if info.get("requested_formats"):
        for fmt in info["requested_formats"]:
            if fmt.get("vcodec") != "none" and fmt.get("url"):
                return (fmt["url"], headers or fmt.get("http_headers", {}), fmt)

    # Select from available formats
    fmts = [f for f in (info.get("formats") or []) if f.get("url")]
    video_fmts = [f for f in fmts if f.get("vcodec") and f["vcodec"] != "none"]
    candidates = video_fmts or fmts

    if not candidates and info.get("url"):
        return (info["url"], headers, {})

    def score(f):
        is_mp4 = 1 if f.get("ext") == "mp4" else 0
        is_http = 1 if str(f.get("protocol", "")).startswith("http") else 0
        height = min(f.get("height") or 0, 1080)
        tbr = f.get("tbr") or 0
        return (is_http, is_mp4, height, tbr)

    candidates.sort(key=score, reverse=True)
    best = candidates[0]

    logger.info("Selected format: id=%s ext=%s height=%s protocol=%s",
                 best.get("format_id"), best.get("ext"), best.get("height"),
                 best.get("protocol"))

    return (best["url"], headers or best.get("http_headers", {}), best)


def _headers_to_ffmpeg_args(headers: Dict[str, str]) -> List[str]:
    """Convert HTTP headers to ffmpeg command-line arguments."""
    args: List[str] = []

    # Build headers string
    header_lines = []
    for k, v in (headers or {}).items():
        header_lines.append(f"{k}: {v}")

    if header_lines:
        args.extend(["-headers", "\r\n".join(header_lines)])

    # Special handling for User-Agent and Referer
    if headers.get("User-Agent"):
        args.extend(["-user_agent", headers["User-Agent"]])
    if headers.get("Referer"):
        args.extend(["-referer", headers["Referer"]])

    return args


def _try_fallback_b_robust(url: str, target_frames: int, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Fallback B: Direct URL → ffmpeg with headers.
    Returns (success, error_message).
    """
    logger.info("Attempting Fallback B: Direct URL to ffmpeg")

    cookie_mode, cookie_value = _get_cookie_config()

    ydl_opts = {
        "format": "bestvideo*[protocol^=http][ext=mp4]/best[protocol^=http][ext=mp4]/best[protocol^=http]",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    if cookie_mode == "file":
        ydl_opts["cookiefile"] = cookie_value
    elif cookie_mode == "browser":
        ydl_opts["cookiesfrombrowser"] = (cookie_value,)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        media_url, headers, fmt_info = _select_media_format(info)

        # Get duration
        duration = 0.0
        for key in ["duration", "duration_float", "duration_seconds"]:
            val = info.get(key)
            if val and float(val) > 0:
                duration = float(val)
                break

        if duration <= 0:
            duration = float(target_frames)

        fps = _compute_fps(duration, target_frames)
        hdr_args = _headers_to_ffmpeg_args(headers)
        output_pattern = tmpdir / "frame_%03d.jpg"

        # Check if HLS - add protocol whitelist
        is_hls = ".m3u8" in media_url or fmt_info.get("protocol") == "m3u8"
        protocol_args = []
        if is_hls:
            protocol_args = ["-protocol_whitelist", "file,http,https,tcp,tls,crypto"]

        ff_cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error",
            *protocol_args,
            *hdr_args,
            "-i", media_url,
            "-an",
            "-vf", f"fps=fps={fps:.8f}:round=up,scale=-2:1080:force_original_aspect_ratio=decrease",
            "-vsync", "vfr",
            "-frames:v", str(target_frames),
            "-q:v", "2",
            str(output_pattern),
        ]

        subprocess.run(
            ff_cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )

        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            return (False, "No frames produced in Fallback B")

        return (True, "")

    except subprocess.TimeoutExpired:
        return (False, "Fallback B: ffmpeg timed out")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else ""
        return (False, f"Fallback B failed: {stderr[:500]}")
    except Exception as exc:
        return (False, f"Fallback B exception: {str(exc)}")


def _try_fallback_c_robust(url: str, target_frames: int, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Fallback C: Download temp file, then extract frames.
    Returns (success, error_message).
    """
    logger.info("Attempting Fallback C: Temp file download")

    cookie_mode, cookie_value = _get_cookie_config()

    temp_video = tmpdir / "temp_video.mp4"

    ydl_opts = {
        "format": "best[ext=mp4][protocol^=http]/best[protocol^=http]",
        "outtmpl": str(temp_video),
        "no_part": True,
        "quiet": True,
        "no_warnings": True,
    }

    if cookie_mode == "file":
        ydl_opts["cookiefile"] = cookie_value
    elif cookie_mode == "browser":
        ydl_opts["cookiesfrombrowser"] = (cookie_value,)

    try:
        # Download video
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if not temp_video.exists():
            return (False, "Fallback C: Download produced no file")

        # Get duration from downloaded file
        try:
            probe_cmd = [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1",
                str(temp_video),
            ]
            duration_str = subprocess.check_output(probe_cmd, stderr=subprocess.STDOUT, text=True).strip()
            duration = float(duration_str)
        except Exception:
            duration = float(target_frames)

        fps = _compute_fps(duration, target_frames)
        output_pattern = tmpdir / "frame_%03d.jpg"

        ff_cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error",
            "-i", str(temp_video),
            "-an",
            "-vf", f"fps=fps={fps:.8f}:round=up,scale=-2:1080:force_original_aspect_ratio=decrease",
            "-vsync", "vfr",
            "-frames:v", str(target_frames),
            "-q:v", "2",
            str(output_pattern),
        ]

        subprocess.run(
            ff_cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )

        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            return (False, "Fallback C: No frames extracted from temp file")

        return (True, "")

    except subprocess.TimeoutExpired:
        return (False, "Fallback C: ffmpeg timed out")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore") if exc.stderr else ""
        return (False, f"Fallback C failed: {stderr[:500]}")
    except Exception as exc:
        return (False, f"Fallback C exception: {str(exc)}")
    finally:
        # Clean up temp video
        if temp_video.exists():
            try:
                temp_video.unlink()
            except Exception:
                pass


def _extract_frames(url: str, target_frames: int) -> List[bytes]:
    """
    Robust frame extraction with fast path + fallbacks.

    Pipeline:
    1. Probe metadata (duration + headers)
    2. Fast path: yt-dlp pipe → ffmpeg (progressive MP4 preference)
    3. Fallback A: Stricter progressive format
    4. Fallback B: Direct URL → ffmpeg with headers
    5. Fallback C: Temp file download

    Returns list of JPEG frame bytes, evenly spaced across video duration.
    """
    start_time = time.perf_counter()
    logger.info("Starting frame extraction for %s (target: %d frames)", url, target_frames)

    # Step 1: Probe metadata
    duration, headers = _probe_metadata_robust(url)
    logger.info("Probed duration: %.2fs", duration)

    with tempfile.TemporaryDirectory(prefix="doom_frames_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)

        # Step 2: Try fast path (primary format)
        format_primary = "bestvideo*[protocol^=http][ext=mp4]/best[protocol^=http][ext=mp4]/best[protocol^=http]"
        success, error = _try_fast_path_robust(url, target_frames, duration, format_primary, settings.frame_extract_timeout, tmpdir)

        if success:
            logger.info("Fast path succeeded with primary format")
        else:
            logger.warning("Fast path failed: %s", error[:200])
            error_class = _classify_error(error)
            logger.info("Error classified as: %s", error_class.value)

            # Step 3: Fallback A - Stricter progressive
            logger.info("Trying Fallback A: Stricter progressive format")
            format_strict = "best[ext=mp4][protocol^=http]/best[protocol^=http]"
            success, error_a = _try_fast_path_robust(url, target_frames, duration, format_strict, settings.frame_extract_timeout, tmpdir)

            if success:
                logger.info("Fallback A succeeded")
            else:
                logger.warning("Fallback A failed: %s", error_a[:200])

                # Step 4: Fallback B - Direct URL
                success, error_b = _try_fallback_b_robust(url, target_frames, settings.frame_extract_timeout, tmpdir)

                if success:
                    logger.info("Fallback B succeeded")
                else:
                    logger.warning("Fallback B failed: %s", error_b[:200])

                    # Step 5: Fallback C - Temp file
                    success, error_c = _try_fallback_c_robust(url, target_frames, settings.frame_extract_timeout, tmpdir)

                    if success:
                        logger.info("Fallback C succeeded")
                    else:
                        # All fallbacks failed
                        error_class = _classify_error(error + error_a + error_b + error_c)
                        raise DownloadError(
                            f"All extraction attempts failed for {url}. Error type: {error_class.value}. "
                            f"Primary: {error[:100]} | FallbackA: {error_a[:100]} | "
                            f"FallbackB: {error_b[:100]} | FallbackC: {error_c[:100]}"
                        )

        # Read frames
        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            raise DownloadError(f"Frame extraction succeeded but no frame files found for {url}")

        frames: List[bytes] = [p.read_bytes() for p in frame_files[:target_frames]]

        if len(frames) < target_frames:
            logger.info("Extracted %d/%d frames (fewer than requested) for %s", len(frames), target_frames, url)

        elapsed = time.perf_counter() - start_time
        logger.info("Frame extraction completed: %d frames in %.2fs for %s", len(frames), elapsed, url)

        return frames


@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(initial=2, max=30))
def _call_inference(frames: List[bytes]) -> Dict:
    files = [
        ("files", (f"frame_{idx:03d}.jpg", blob, "image/jpeg"))
        for idx, blob in enumerate(frames)
    ]
    headers = {
        "Authorization": f"Bearer {settings.hf_token}",
        "X-API-Key": settings.infer_api_key,
    }

    response = requests.post(
        settings.infer_api_url.rstrip("/") + "/v1/infer",
        headers=headers,
        files=files,
        timeout=settings.infer_request_timeout,
    )
    response.raise_for_status()
    return response.json()


def _check_heuristics(title: Optional[str], channel: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Check for AI keywords in title and channel.
    Returns heuristics result similar to backend format.
    """
    ai_keywords = [
        "ai generated",
        "ai-generated",
        "artificial intelligence",
        "deepfake",
        "synthetic",
        "generated by ai",
        "created by ai",
        "ai content",
        "ai video",
        "machine learning",
        "neural network",
        "computer generated",
    ]

    combined_text = f"{title or ''} {channel or ''}".lower()

    for keyword in ai_keywords:
        if keyword in combined_text:
            return {
                "result": "ai-detected",
                "confidence": 0.7,
                "reason": f"keyword_match: {keyword}",
            }

    return {
        "result": "verified",
        "confidence": 0.3,
        "reason": "no_keywords",
    }


def _aggregate(
    payload: Dict,
    title: Optional[str] = None,
    channel: Optional[str] = None,
) -> tuple[Dict[str, float], str, float, str, Dict[str, Any]]:
    """
    Aggregate inference results with conservative classification.
    Integrates heuristics (AI keywords in title/channel) into decision logic.
    Skews towards real - only classifies as AI with very strong signals.
    """
    results = payload.get("results", []) or []
    label_scores_list: List[Dict[str, float]] = []
    vote_totals = {"real": 0.0, "artificial": 0.0}

    for entry in results:
        scores = entry.get("label_scores", {}) or {}
        real_score = float(scores.get("real", 0.0))
        artificial_score = float(scores.get("artificial", 0.0))
        label_scores_list.append(
            {
                "real": real_score,
                "artificial": artificial_score,
            }
        )
        vote_totals["real"] += real_score
        vote_totals["artificial"] += artificial_score

    total_votes = vote_totals["real"] + vote_totals["artificial"] or 1.0
    vote_share = {
        "real": vote_totals["real"] / total_votes,
        "artificial": vote_totals["artificial"] / total_votes,
    }

    # Check heuristics for AI keywords
    heuristics_result = _check_heuristics(title, channel)

    # Use conservative decision logic with heuristics integration
    decision = _decide_label(label_scores_list, heuristics_result)
    internal_label = decision["label"]

    # Map to external labels - default to verified instead of unknown
    label_map = {
        "artificial": "ai-detected",
        "real": "verified",
        "suspicious": "suspicious",
    }
    external_label = label_map.get(internal_label, "verified")
    confidence = float(decision.get("confidence", 0.0))
    reason_suffix = decision.get("reason", "model_vote")
    reason = f"model_vote: {reason_suffix}"
    features = decision.get("features", {})

    return vote_share, external_label, confidence, reason, features


def _decide_label(
    scores_list: List[Dict[str, float]],
    heuristics_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Conservative classification logic that skews towards real.
    Only classifies as AI with very strong signals.
    Integrates heuristics for AI keywords in title/description.
    Never returns unknown - always picks real, suspicious, or artificial.
    """
    total_frames = len(scores_list)
    artificial_scores = [scores["artificial"] for scores in scores_list]

    vote_counts = {"real": 0, "artificial": 0}
    for scores in scores_list:
        if scores["artificial"] >= scores["real"]:
            vote_counts["artificial"] += 1
        else:
            vote_counts["real"] += 1

    if artificial_scores:
        sorted_artificial = sorted(artificial_scores, reverse=True)
        max_artificial = sorted_artificial[0]
        top3 = sorted_artificial[:3]
        top3_mean = sum(top3) / len(top3) if top3 else 0.0
    else:
        sorted_artificial = []
        max_artificial = 0.0
        top3 = []
        top3_mean = 0.0

    # Count frames at different thresholds
    count_a95 = sum(score >= 0.95 for score in artificial_scores)
    count_a90 = sum(score >= 0.90 for score in artificial_scores)
    count_a80 = sum(score >= 0.80 for score in artificial_scores)
    frac_a95 = count_a95 / total_frames if total_frames else 0.0
    frac_a90 = count_a90 / total_frames if total_frames else 0.0
    frac_a80 = count_a80 / total_frames if total_frames else 0.0
    majority_label = (
        "artificial"
        if vote_counts["artificial"] >= vote_counts["real"]
        else "real"
    )

    features = {
        "majority_label": majority_label,
        "real_votes": vote_counts["real"],
        "artificial_votes": vote_counts["artificial"],
        "total_frames": total_frames,
        "max_artificial": max_artificial,
        "top3_mean_artificial": top3_mean,
        "count_a95": count_a95,
        "count_a90": count_a90,
        "count_a80": count_a80,
        "frac_a95": frac_a95,
        "frac_a90": frac_a90,
        "frac_a80": frac_a80,
    }

    # Check heuristics for AI keywords in title/description
    has_ai_keywords = False
    if heuristics_result:
        if heuristics_result.get("result") == "ai-detected":
            has_ai_keywords = True

    # Rule 1: Too few frames - default to real (not unknown)
    if total_frames < 4:
        return {
            "label": "real",
            "confidence": 0.5,
            "reason": "too_few_frames_default_real",
            "features": features,
        }

    # Rule 2: Very strong artificial signal
    # With AI keywords: moderate threshold
    # Without AI keywords: need VERY strong signal
    if has_ai_keywords:
        # Lower thresholds when AI keywords are present
        if (
            frac_a95 >= 0.35
            or (count_a90 >= 4 and top3_mean >= 0.94)
            or frac_a90 >= 0.5
        ):
            return {
                "label": "artificial",
                "confidence": max_artificial,
                "reason": "strong_artificial_with_keywords",
                "features": features,
            }
    else:
        # NO AI keywords - need VERY strong signal to classify as AI
        if (
            frac_a95 >= 0.6
            or (count_a95 >= 6 and top3_mean >= 0.97)
            or (frac_a90 >= 0.75 and len(sorted_artificial) >= 5 and min(sorted_artificial[:5]) >= 0.93)
        ):
            return {
                "label": "artificial",
                "confidence": max_artificial,
                "reason": "very_strong_artificial_no_keywords",
                "features": features,
            }

    # Rule 3: Suspicious signals
    # With AI keywords: lower threshold for suspicion
    # Without AI keywords: need stronger signal
    if has_ai_keywords:
        if (
            count_a90 >= 1
            or frac_a80 >= 0.20
            or max_artificial >= 0.85
        ):
            return {
                "label": "suspicious",
                "confidence": max_artificial,
                "reason": "ai_keywords_with_signals",
                "features": features,
            }
    else:
        # Without keywords, need more evidence for suspicion
        if (
            (3 <= count_a90 <= 5 and top3_mean >= 0.93)
            or (0.30 <= frac_a90 <= 0.60 and max_artificial >= 0.92)
            or (frac_a80 >= 0.40 and top3_mean >= 0.90)
        ):
            return {
                "label": "suspicious",
                "confidence": max_artificial,
                "reason": "mixed_signal_no_keywords",
                "features": features,
            }

    # Rule 4: Default to real
    return {
        "label": "real",
        "confidence": max(1.0 - max_artificial, 0.6),
        "reason": "default_real",
        "features": features,
    }


def _upsert_results(
    *,
    platform: str,
    video_id: str,
    label: str,
    confidence: float,
    vote_share: Dict[str, float],
    batch_time_ms: float | None,
    frames_count: int,
    title: Optional[str],
    channel: Optional[str],
    published_at: Optional[str],
    region: Optional[str],
    source_url: Optional[str],
    reason: str,
    aggregate_features: Dict[str, Any],
    views_per_hour: Optional[float],
) -> None:
    now = datetime.now(timezone.utc)
    features = json.dumps(
        {
            "vote_share": vote_share,
            "aggregate_features": aggregate_features,
        }
    )
    published_at_dt = _parse_iso_datetime(published_at)
    vph_value: Optional[float] = None
    if views_per_hour is not None:
        try:
            vph_value = float(views_per_hour)
        except (TypeError, ValueError):
            logger.debug("Invalid views_per_hour value for %s:%s -> %s", platform, video_id, views_per_hour)
            vph_value = None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO videos (
                    platform,
                    video_id,
                    first_seen_at,
                    last_seen_at,
                    title,
                    channel,
                    published_at,
                    region,
                    source_url,
                    views_per_hour
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (platform, video_id)
                DO UPDATE SET
                    last_seen_at = EXCLUDED.last_seen_at,
                    title = COALESCE(EXCLUDED.title, videos.title),
                    channel = COALESCE(EXCLUDED.channel, videos.channel),
                    published_at = COALESCE(EXCLUDED.published_at, videos.published_at),
                    region = COALESCE(EXCLUDED.region, videos.region),
                    source_url = COALESCE(EXCLUDED.source_url, videos.source_url),
                    views_per_hour = COALESCE(EXCLUDED.views_per_hour, videos.views_per_hour)
                """,
                (
                    platform,
                    video_id,
                    now,
                    now,
                    title,
                    channel,
                    published_at_dt,
                    region,
                    source_url,
                    vph_value,
                ),
            )

            cur.execute(
                """
                INSERT INTO analyses (
                    platform, video_id, analyzed_at, label, confidence,
                    reason, features, model_version, frame_policy, batch_time_ms, frames_count, source_url
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
                ON CONFLICT (platform, video_id)
                DO UPDATE SET
                    analyzed_at = EXCLUDED.analyzed_at,
                    label = EXCLUDED.label,
                    confidence = EXCLUDED.confidence,
                    reason = EXCLUDED.reason,
                    features = EXCLUDED.features,
                    model_version = EXCLUDED.model_version,
                    frame_policy = EXCLUDED.frame_policy,
                    batch_time_ms = EXCLUDED.batch_time_ms,
                    frames_count = EXCLUDED.frames_count,
                    source_url = COALESCE(EXCLUDED.source_url, analyses.source_url)
                """,
                (
                    platform,
                    video_id,
                    now,
                    label,
                    confidence,
                    reason,
                    features,
                    "doom_v1",
                    f"even_{settings.infer_target_frames}",
                    int(batch_time_ms) if batch_time_ms is not None else None,
                    frames_count,
                    source_url,
                ),
            )
        conn.commit()


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        logger.debug("Unable to parse published_at value %s", value)
        return None


def _cache_result(
    *,
    platform: str,
    video_id: str,
    label: str,
    confidence: float,
    vote_share: Dict[str, float],
    analyzed_at: datetime,
    model_version: str,
    title: Optional[str],
    channel: Optional[str],
    published_at: Optional[str],
    region: Optional[str],
    source_url: Optional[str],
    reason: str,
    views_per_hour: Optional[float],
) -> None:
    redis = get_redis()
    key = f"video:{platform}:{video_id}"
    payload = {
        "platform": platform,
        "video_id": video_id,
        "label": label,
        "confidence": confidence,
        "vote_share": vote_share,
        "analyzed_at": analyzed_at.isoformat(),
        "model_version": model_version,
        "reason": reason,
    }
    if views_per_hour is not None:
        try:
            payload["views_per_hour"] = float(views_per_hour)
        except (TypeError, ValueError):
            logger.debug(
                "Skipping invalid views_per_hour for cache on %s:%s -> %s",
                platform,
                video_id,
                views_per_hour,
            )
    if title:
        payload["title"] = title
    if channel:
        payload["channel"] = channel
    if published_at:
        payload["published_at"] = published_at
    if region:
        payload["region"] = region
    if source_url:
        payload["source_url"] = source_url
    redis.set(key, json.dumps(payload), ex=3600)
