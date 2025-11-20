"""
Test pipeline: yt-dlp -> ffmpeg frame extraction
With HTTP(S) proxy support for IPRoyal
"""

import logging
import os
import subprocess
import tempfile
import threading
import time
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================
# CONFIG
# ============================

# IPRoyal proxy configuration
PROXY_HOSTNAME = "geo.iproyal.com"
PROXY_PORT = "12321"
PROXY_USERNAME = "W5Iv32oWtm7fojwO"
PROXY_PASSWORD = "lYIxuCceJeqwfbVO_country-us_city-ashburn"

# Construct proxy URL (set to None to disable proxy)
PROXY_URL = f"http://{PROXY_USERNAME}:{PROXY_PASSWORD}@{PROXY_HOSTNAME}:{PROXY_PORT}"
# PROXY_URL = None  # uncomment to disable proxy

# Path to YouTube cookies (optional but recommended to avoid bot walls)
COOKIES_FILE = r"C:/Users/gideo/Documents/Hackathon-project/resolver/cookies/www_youtube.com_cookies.txt"

# Output directory for debug frames
OUTPUT_DIR = Path(r"C:/Users/gideo/Documents/Hackathon-project/out")


# ============================
# ENV + HELPERS
# ============================

def _yt_env() -> dict:
    """
    Build environment for yt-dlp/ffmpeg with HTTP(S) proxy if configured.
    This is the only place we touch PROXY_URL, so you can toggle it easily.
    """
    env = os.environ.copy()
    if PROXY_URL:
        env["HTTP_PROXY"] = PROXY_URL
        env["HTTPS_PROXY"] = PROXY_URL
    return env


def _compute_fps(duration: float, target_frames: int) -> float:
    """Compute FPS to extract target number of frames."""
    if duration <= 0:
        return 1.0
    return target_frames / duration


def _probe_duration(url: str) -> float:
    """
    Probe video duration using yt-dlp.
    Uses --ignore-config so your global yt-dlp config can't break this.
    """
    try:
        cmd = [
            "yt-dlp",
            "--ignore-config",     # important: ignore any global -f, etc.
            "--get-duration",
            "--no-warnings",
        ]

        if os.path.exists(COOKIES_FILE):
            cmd += ["--cookies", COOKIES_FILE]

        cmd.append(url)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            env=_yt_env(),
        )

        if result.returncode != 0:
            logger.warning(
                "yt-dlp --get-duration failed (rc=%s): %s",
                result.returncode,
                (result.stderr or "").strip(),
            )
            return 16.0  # safe default for Shorts

        duration_str = result.stdout.strip()
        if not duration_str:
            logger.warning("yt-dlp --get-duration returned empty output")
            return 16.0

        # Parse duration (HH:MM:SS or MM:SS or SS)
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


def _drain_stderr(proc: subprocess.Popen, output_list: List[str]):
    """Thread function to drain stderr from a subprocess to avoid deadlock."""
    try:
        if proc.stderr:
            for line in iter(proc.stderr.readline, b""):
                output_list.append(line.decode("utf-8", errors="ignore"))
    except Exception:
        pass


# ============================
# CORE: yt-dlp -> ffmpeg
# ============================

def _extract_frames_fast_path(
    url: str,
    target_frames: int,
    duration: float,
    format_selector: str,
    timeout: int,
    tmpdir: Path,
) -> Tuple[bool, str]:
    """
    Fast path: yt-dlp pipe → ffmpeg stdin.
    Returns (success, error_message).
    """

    output_pattern = tmpdir / "frame_%03d.jpg"

    # yt-dlp command:
    #  - --ignore-config: don't pick up weird defaults from ~/.config/yt-dlp/*
    #  - -f best[ext=mp4]/best : favour a simple progressive mp4 (video only is fine)
    yt_cmd = [
        "yt-dlp",
        "--ignore-config",
        "-f", format_selector,
        "-o", "-",
        "--quiet",
        "--no-warnings",
    ]

    if os.path.exists(COOKIES_FILE):
        yt_cmd += ["--cookies", COOKIES_FILE]

    yt_cmd.append(url)

    fps = _compute_fps(duration, target_frames)

    ff_cmd = [
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

    logger.debug(f"Fast path format: {format_selector}")
    logger.info(f"Proxy configured: {PROXY_URL is not None}")

    ydl_stderr_lines: List[str] = []

    try:
        ydl_proc = subprocess.Popen(
            yt_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_yt_env(),  # proxy env
        )
    except FileNotFoundError:
        return False, "yt-dlp not found"

    stderr_thread = threading.Thread(
        target=_drain_stderr,
        args=(ydl_proc, ydl_stderr_lines),
        daemon=True,
    )
    stderr_thread.start()

    try:
        ff_result = subprocess.run(
            ff_cmd,
            stdin=ydl_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            env=_yt_env(),  # not strictly needed, but harmless
        )
    except FileNotFoundError:
        ydl_proc.kill()
        return False, "ffmpeg not found"
    except subprocess.TimeoutExpired:
        ydl_proc.kill()
        return False, "ffmpeg timed out"
    finally:
        if ydl_proc.stdout:
            ydl_proc.stdout.close()
        try:
            ydl_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            ydl_proc.kill()
            ydl_proc.wait(timeout=5)
        stderr_thread.join(timeout=1)

    if ff_result.returncode != 0:
        ff_stderr = (ff_result.stderr or b"").decode("utf-8", errors="ignore")
        ydl_stderr = "".join(ydl_stderr_lines)
        return (
            False,
            f"ffmpeg failed (rc={ff_result.returncode}). "
            f"ffmpeg: {ff_stderr[:300]} yt-dlp: {ydl_stderr[:300]}",
        )

    frame_files = sorted(tmpdir.glob("frame_*.jpg"))
    if not frame_files:
        ydl_stderr = "".join(ydl_stderr_lines)
        return False, f"No frames produced. yt-dlp: {ydl_stderr[:300]}"

    return True, ""


def _extract_frames(
    url: str,
    target_frames: int = 16,
    timeout: int = 180,
) -> Tuple[List[bytes], float]:
    """
    Extract frames using yt-dlp -> ffmpeg pipeline with proxy support.
    Returns (frames, extraction_time_seconds).
    """
    logger.info(f"Extracting {target_frames} frames from {url}")

    start_time = time.time()
    duration = _probe_duration(url)
    logger.info(f"Video duration (approx): {duration}s")

    with tempfile.TemporaryDirectory(prefix="test_frames_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)

        # Primary: try to get a single progressive mp4 (video-only is fine)
        format_primary = "best[ext=mp4]/best"
        success, error = _extract_frames_fast_path(
            url,
            target_frames,
            duration,
            format_primary,
            timeout,
            tmpdir,
        )

        if not success:
            logger.warning(f"Fast path failed (primary): {error[:200]}")

            # Fallback: let yt-dlp pick "best" however it can
            format_fallback = "best"
            success, error = _extract_frames_fast_path(
                url,
                target_frames,
                duration,
                format_fallback,
                timeout,
                tmpdir,
            )

            if not success:
                # At this point, errors are almost always:
                #  - geo/age/bot gating ("Sign in to confirm…")
                #  - truly no downloadable stream for that IP
                raise RuntimeError(
                    f"Frame extraction failed. "
                    f"Primary error: {error[:400]}"
                )

        extraction_time = time.time() - start_time

        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            raise RuntimeError("Extraction succeeded but no frame files found")

        # Save frames to debug output dir
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for old in OUTPUT_DIR.glob("frame_*.jpg"):
            old.unlink()
        for frame_file in frame_files[:target_frames]:
            shutil.copy2(frame_file, OUTPUT_DIR / frame_file.name)

        logger.info(f"✓ Saved {len(frame_files[:target_frames])} frames to {OUTPUT_DIR}")
        logger.info(f"✓ Extracted {len(frame_files[:target_frames])} frames in {extraction_time:.2f}s")

        frames = [p.read_bytes() for p in frame_files[:target_frames]]
        return frames, extraction_time


# ============================
# Public test entry-point
# ============================

def test_full_pipeline(url: str, target_frames: int = 16) -> Dict[str, Any]:
    """
    Main test function: Extract frames (proxy-aware).
    """
    logger.info("=" * 60)
    logger.info(f"Testing pipeline for: {url}")
    logger.info("=" * 60)

    try:
        frames, extraction_time = _extract_frames(url, target_frames)

        print(f"\n{'='*60}")
        print(f"⏱️  FRAME EXTRACTION TIME: {extraction_time:.2f} seconds")
        print(f"📁 Frames saved to: {OUTPUT_DIR}")
        print(f"{'='*60}\n")

        logger.info("=" * 60)
        logger.info("Frame extraction test SUCCESSFUL")
        logger.info("=" * 60)

        return {
            "extraction_time_seconds": extraction_time,
            "frames_extracted": len(frames),
        }

    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"Pipeline test FAILED: {e}")
        logger.error("=" * 60)
        raise
