"""
Doomscroller Resolver - Frame Extraction + Inference Service
Handles frame extraction for doomscroller video analysis.
Runs locally on residential IP to bypass YouTube restrictions.
"""

import base64
import logging
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from yt_dlp import YoutubeDL

load_dotenv()

app = FastAPI(title="Doomscroller Resolver")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_COOKIES_FILE = r"C:/Users/gideo/Documents/Hackathon-project/resolver/cookies/www_youtube.com_cookies.txt"

def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required for the resolver service")
    return value

COOKIES_FILE = os.getenv("YTDLP_COOKIES_FILE", DEFAULT_COOKIES_FILE)
INFER_API_URL = _require_env("DOOMSCROLLER_INFER_API_URL")
INFER_API_KEY = _require_env("DOOMSCROLLER_INFER_API_KEY")
HF_TOKEN = _require_env("HUGGING_FACE_API_KEY")


class AnalysisRequest(BaseModel):
    url: str
    title: str = None
    channel: str = None
    target_frames: int = 16
    timeout: int = 180


class AnalysisResponse(BaseModel):
    success: bool
    inference: Dict[str, Any] = {}
    frames_count: int = 0
    error: str = ""


def _compute_fps(duration: float, target_frames: int) -> float:
    """Compute FPS to extract target number of frames."""
    if duration <= 0:
        return 1.0
    return target_frames / duration


def _build_yt_dlp_command(url: str, format_selector: str) -> List[str]:
    """Build yt-dlp command for streaming video."""
    cmd = [
        "yt-dlp",
        "-f", format_selector,
        "-o", "-",
        "--quiet",
        "--no-warnings",
        url,
    ]

    if os.path.exists(COOKIES_FILE):
        cmd.extend(["--cookies", COOKIES_FILE])

    return cmd


def _build_ffmpeg_command(duration: float, target_frames: int, output_pattern: Path) -> List[str]:
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


def _probe_duration(url: str) -> float:
    """Probe video duration using yt-dlp."""
    try:
        cmd = ["yt-dlp", "--get-duration", "--no-warnings", url]
        if os.path.exists(COOKIES_FILE):
            cmd.extend(["--cookies", COOKIES_FILE])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        duration_str = result.stdout.strip()

        # Parse duration (format: HH:MM:SS or MM:SS or SS)
        parts = duration_str.split(":")
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        else:
            return float(parts[0])
    except Exception as e:
        logger.warning(f"Failed to probe duration: {e}, defaulting to 16s")
        return 16.0


def _try_fast_path(url: str, target_frames: int, duration: float, format_selector: str, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Try fast path: yt-dlp pipe → ffmpeg stdin. Returns (success, error_message)."""
    output_pattern = tmpdir / "frame_%03d.jpg"

    yt_cmd = _build_yt_dlp_command(url, format_selector)
    ff_cmd = _build_ffmpeg_command(duration, target_frames, output_pattern)

    logger.debug(f"Fast path format: {format_selector}")

    ydl_stderr_lines: List[str] = []

    try:
        ydl_proc = subprocess.Popen(yt_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        return (False, "yt-dlp not found")

    stderr_thread = threading.Thread(target=_drain_stderr, args=(ydl_proc, ydl_stderr_lines), daemon=True)
    stderr_thread.start()

    try:
        subprocess.run(
            ff_cmd,
            stdin=ydl_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        ydl_proc.kill()
        return (False, "ffmpeg not found")
    except subprocess.TimeoutExpired:
        ydl_proc.kill()
        return (False, "ffmpeg timed out")
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

    frame_files = sorted(tmpdir.glob("frame_*.jpg"))
    if not frame_files:
        ydl_stderr = "".join(ydl_stderr_lines)
        return (False, f"No frames produced. yt-dlp: {ydl_stderr[:500]}")

    return (True, "")


def _try_fallback_b(url: str, target_frames: int, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Fallback B: Direct URL → ffmpeg with headers. Returns (success, error_message)."""
    logger.info("Attempting Fallback B: Direct URL to ffmpeg")

    ydl_opts = {
        "format": "bestvideo*[ext=mp4]/bestvideo*/best[ext=mp4]/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    if os.path.exists(COOKIES_FILE):
        ydl_opts["cookiefile"] = COOKIES_FILE

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Get media URL and headers
        if "entries" in info and info["entries"]:
            info = info["entries"][0]

        media_url = info.get("url")
        headers = info.get("http_headers", {})

        if not media_url:
            return (False, "No media URL found")

        # Get duration
        duration = info.get("duration") or info.get("duration_float") or float(target_frames)
        fps = _compute_fps(duration, target_frames)
        output_pattern = tmpdir / "frame_%03d.jpg"

        # Build headers args for ffmpeg
        header_lines = [f"{k}: {v}" for k, v in headers.items()]
        hdr_args = ["-headers", "\r\n".join(header_lines)] if header_lines else []

        # Check if HLS
        is_hls = ".m3u8" in media_url
        protocol_args = ["-protocol_whitelist", "file,http,https,tcp,tls,crypto"] if is_hls else []

        ff_cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            *protocol_args, *hdr_args,
            "-i", media_url, "-an",
            "-vf", f"fps=fps={fps:.8f}:round=up,scale=-2:1080:force_original_aspect_ratio=decrease",
            "-vsync", "vfr", "-frames:v", str(target_frames),
            "-q:v", "2", str(output_pattern),
        ]

        subprocess.run(ff_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)

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


def _try_fallback_c(url: str, target_frames: int, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """Fallback C: Download temp file, then extract frames. Returns (success, error_message)."""
    logger.info("Attempting Fallback C: Temp file download")

    temp_video = tmpdir / "temp_video.mp4"

    ydl_opts = {
        "format": "best[ext=mp4]/best",
        "outtmpl": str(temp_video),
        "no_part": True,
        "quiet": True,
        "no_warnings": True,
    }

    if os.path.exists(COOKIES_FILE):
        ydl_opts["cookiefile"] = COOKIES_FILE

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if not temp_video.exists():
            return (False, "Fallback C: Download produced no file")

        # Get duration from downloaded file
        try:
            probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                         "-of", "default=nw=1:nk=1", str(temp_video)]
            duration_str = subprocess.check_output(probe_cmd, stderr=subprocess.STDOUT, text=True).strip()
            duration = float(duration_str)
        except Exception:
            duration = float(target_frames)

        fps = _compute_fps(duration, target_frames)
        output_pattern = tmpdir / "frame_%03d.jpg"

        ff_cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", str(temp_video), "-an",
            "-vf", f"fps=fps={fps:.8f}:round=up,scale=-2:1080:force_original_aspect_ratio=decrease",
            "-vsync", "vfr", "-frames:v", str(target_frames),
            "-q:v", "2", str(output_pattern),
        ]

        subprocess.run(ff_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)

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
        if temp_video.exists():
            try:
                temp_video.unlink()
            except Exception:
                pass


def _extract_frames(url: str, target_frames: int, timeout: int) -> List[bytes]:
    """
    Robust frame extraction with fast path + fallbacks.
    Pipeline: Fast path → Fallback A → Fallback B → Fallback C
    """
    logger.info(f"Extracting {target_frames} frames from {url}")

    duration = _probe_duration(url)
    logger.info(f"Video duration: {duration}s")

    with tempfile.TemporaryDirectory(prefix="doomscroller_frames_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)

        # Fast path - flexible format
        format_primary = "bestvideo*[ext=mp4]/bestvideo*/best[ext=mp4]/best"
        success, error = _try_fast_path(url, target_frames, duration, format_primary, timeout, tmpdir)

        if success:
            logger.info("Fast path succeeded")
        else:
            logger.warning(f"Fast path failed: {error[:200]}")

            # Fallback A - stricter format
            logger.info("Trying Fallback A: Stricter format")
            format_strict = "best[ext=mp4]/best"
            success, error_a = _try_fast_path(url, target_frames, duration, format_strict, timeout, tmpdir)

            if success:
                logger.info("Fallback A succeeded")
            else:
                logger.warning(f"Fallback A failed: {error_a[:200]}")

                # Fallback B - direct URL
                success, error_b = _try_fallback_b(url, target_frames, timeout, tmpdir)

                if success:
                    logger.info("Fallback B succeeded")
                else:
                    logger.warning(f"Fallback B failed: {error_b[:200]}")

                    # Fallback C - temp file
                    success, error_c = _try_fallback_c(url, target_frames, timeout, tmpdir)

                    if success:
                        logger.info("Fallback C succeeded")
                    else:
                        # All fallbacks failed
                        raise RuntimeError(
                            f"All extraction attempts failed. "
                            f"Primary: {error[:100]} | FallbackA: {error_a[:100]} | "
                            f"FallbackB: {error_b[:100]} | FallbackC: {error_c[:100]}"
                        )

        # Read frames
        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            raise RuntimeError("Frame extraction succeeded but no frame files found")

        frames = [p.read_bytes() for p in frame_files[:target_frames]]
        logger.info(f"Extracted {len(frames)} frames successfully")

        return frames


def _call_inference(frames: List[bytes]) -> Dict[str, Any]:
    """Call HuggingFace inference API."""
    logger.info(f"Calling inference API with {len(frames)} frames")

    endpoint = INFER_API_URL.rstrip("/")
    if not endpoint.endswith("/v1/infer"):
        endpoint = f"{endpoint}/v1/infer"

    files = [
        ("files", (f"frame_{idx:03d}.jpg", blob, "image/jpeg"))
        for idx, blob in enumerate(frames)
    ]

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "X-API-Key": INFER_API_KEY,
    }

    try:
        response = requests.post(
            endpoint,
            headers=headers,
            files=files,
            timeout=180,
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Inference API call failed: {e}")
        raise RuntimeError(f"Inference failed: {str(e)}")


@app.get("/")
def root():
    return {"service": "Doomscroller Resolver", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy", "service": "doomscroller-resolver"}


@app.post("/analyze", response_model=AnalysisResponse)
def analyze(request: AnalysisRequest):
    """
    Extract frames from video and run inference for doomscroller.
    Returns inference results to caller (doomscroller analyzer will upsert to DB).
    """
    start_time = time.time()

    try:
        # Extract frames locally
        frames = _extract_frames(request.url, request.target_frames, request.timeout)

        # Call inference API
        inference_result = _call_inference(frames)

        elapsed = time.time() - start_time
        logger.info(f"Doomscroller analysis completed in {elapsed:.2f}s")

        return AnalysisResponse(
            success=True,
            inference=inference_result,
            frames_count=len(frames),
        )

    except Exception as e:
        logger.error(f"Error analyzing {request.url}: {e}")
        return AnalysisResponse(
            success=False,
            error=str(e),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
