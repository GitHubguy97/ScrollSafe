"""
Test pipeline: yt-dlp -> ffmpeg frame extraction
Clean implementation based on deepscan_resolver.py
"""
import logging
import subprocess
import tempfile
import threading
import time
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Output directory for frames
OUTPUT_DIR = Path("C:/Users/gideo/Documents/Hackathon-project/out")


def _compute_fps(duration: float, target_frames: int) -> float:
    """Compute FPS to extract target number of frames."""
    if duration <= 0:
        return 1.0
    return target_frames / duration


def _probe_duration(url: str) -> float:
    """Probe video duration using yt-dlp."""
    try:
        cmd = ["yt-dlp", "--get-duration", "--no-warnings", url]
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


def _drain_stderr(proc: subprocess.Popen, output_list: List[str]):
    """Thread function to drain stderr from a subprocess to avoid deadlock."""
    try:
        if proc.stderr:
            for line in iter(proc.stderr.readline, b""):
                output_list.append(line.decode("utf-8", errors="ignore"))
    except Exception:
        pass


def _extract_frames_fast_path(url: str, target_frames: int, duration: float, format_selector: str, timeout: int, tmpdir: Path) -> Tuple[bool, str]:
    """
    Fast path: yt-dlp pipe → ffmpeg stdin.
    Returns (success, error_message).
    """
    output_pattern = tmpdir / "frame_%03d.jpg"

    # Build yt-dlp command
    yt_cmd = [
        "yt-dlp",
        "-f", format_selector,
        "-o", "-",
        "--quiet",
        "--no-warnings",
        url,
    ]

    # Build ffmpeg command
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


def _extract_frames(url: str, target_frames: int = 16, timeout: int = 180) -> Tuple[List[bytes], float]:
    """
    Extract frames using yt-dlp -> ffmpeg pipeline with fallbacks.
    Returns tuple of (frame_bytes, extraction_time_seconds).
    """
    logger.info(f"Extracting {target_frames} frames from {url}")

    # Start timing
    start_time = time.time()

    # Get video duration
    duration = _probe_duration(url)
    logger.info(f"Video duration: {duration}s")

    with tempfile.TemporaryDirectory(prefix="test_frames_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)

        # Try fast path with primary format
        format_primary = "bestvideo*[ext=mp4]/bestvideo*/best[ext=mp4]/best"
        success, error = _extract_frames_fast_path(url, target_frames, duration, format_primary, timeout, tmpdir)

        if success:
            logger.info("Fast path succeeded")
        else:
            logger.warning(f"Fast path failed: {error[:200]}")

            # Fallback: stricter format
            logger.info("Trying Fallback: Stricter format")
            format_strict = "best[ext=mp4]/best"
            success, error_a = _extract_frames_fast_path(url, target_frames, duration, format_strict, timeout, tmpdir)

            if success:
                logger.info("Fallback succeeded")
            else:
                # All attempts failed
                raise RuntimeError(
                    f"Frame extraction failed. "
                    f"Primary: {error[:100]} | Fallback: {error_a[:100]}"
                )

        # Calculate extraction time
        extraction_time = time.time() - start_time

        # Read extracted frames
        frame_files = sorted(tmpdir.glob("frame_*.jpg"))
        if not frame_files:
            raise RuntimeError("Frame extraction succeeded but no frame files found")

        # Save frames to output directory
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Clear previous frames
        for old_frame in OUTPUT_DIR.glob("frame_*.jpg"):
            old_frame.unlink()

        # Copy frames
        for frame_file in frame_files[:target_frames]:
            shutil.copy2(frame_file, OUTPUT_DIR / frame_file.name)

        logger.info(f"✓ Saved {len(frame_files[:target_frames])} frames to {OUTPUT_DIR}")

        frames = [p.read_bytes() for p in frame_files[:target_frames]]
        logger.info(f"✓ Extracted {len(frames)} frames in {extraction_time:.2f}s")

        return frames, extraction_time


def test_full_pipeline(url: str, target_frames: int = 16) -> Dict[str, Any]:
    """
    Main test function: Extract frames from video.

    Args:
        url: Video URL (YouTube, Instagram, etc.)
        target_frames: Number of frames to extract

    Returns:
        Dict containing extraction time and frame count
    """
    logger.info("=" * 60)
    logger.info(f"Testing pipeline for: {url}")
    logger.info("=" * 60)

    try:
        # Extract frames
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
