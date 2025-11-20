from __future__ import annotations

import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List

import yt_dlp

from scripts.enqueue import enqueue_video

# Example enqueue usage:
# enqueue_video(
#     "tiktok",
#     "7547414401859489055",
#     "https://www.tiktok.com/@jacobmhoff/video/7547414401859489055",
#     title="Example video",
#     channel="jacobmhoff",
#     published_at="2025-10-29T00:00:00Z",
#     region="US",
# )
# DEFAULT_OUTPUT_ROOT = Path(r"C:\Users\gideo\Documents\Hackathon-project\out")


# def _sanitize_name(value: str) -> str:
#     allowed = "-_"
#     return "".join(ch for ch in value if ch.isalnum() or ch in allowed) or "video"


# def _probe_metadata(url: str) -> dict:
#     opts = {
#         "quiet": True,
#         "no_warnings": True,
#         "skip_download": True,
#         "socket_timeout": 15,
#         "retries": 2,
#         "ignore_no_formats_error": False,
#     }
#     with yt_dlp.YoutubeDL(opts) as ydl:
#         info = ydl.extract_info(url, download=False)
#     if info.get("_type") == "playlist":
#         entries = info.get("entries") or []
#         if not entries:
#             raise RuntimeError(f"No entries returned for URL: {url}")
#         info = entries[0]
#     return info


# def _build_yt_dlp_command(url: str) -> List[str]:
#     cmd = [
#         "yt-dlp",
#         "-f",
#         "bestvideo[height<=1080]/best",
#         "-o",
#         "-",
#         "--quiet",
#         "--no-warnings",
#         "--no-part",
#         url,
#     ]
#     cookie_browser = os.getenv("YTDLP_COOKIES_BROWSER")
#     if cookie_browser:
#         cmd.extend(["--cookies-from-browser", cookie_browser])
#     return cmd


# def _build_ffmpeg_command(*, duration_seconds: float, target_frames: int, output_pattern: Path) -> List[str]:
#     duration_seconds = max(duration_seconds, 0.001)
#     fps_value = max(target_frames / duration_seconds, 0.01)
#     filters = [
#         f"fps=fps={fps_value:.8f}:round=up",
#         "scale=-2:1080:force_original_aspect_ratio=decrease",
#     ]
#     return [
#         "ffmpeg",
#         "-hide_banner",
#         "-loglevel",
#         "error",
#         "-nostdin",
#         "-i",
#         "pipe:0",
#         "-an",
#         "-vf",
#         ",".join(filters),
#         "-vsync",
#         "vfr",
#         "-frames:v",
#         str(target_frames),
#         "-q:v",
#         "2",
#         str(output_pattern),
#     ]


# def extract_frames_from_url(
#     url: str,
#     *,
#     target_frames: int = 16,
#     output_root: Path | str = DEFAULT_OUTPUT_ROOT,
# ) -> Path:
#     """
#     Stream `url` with yt-dlp, pipe into ffmpeg, and write JPEG frames under `output_root`.
#     """
#     output_root = Path(output_root)
#     output_root.mkdir(parents=True, exist_ok=True)

#     metadata = _probe_metadata(url)
#     duration_fields = [
#         metadata.get("duration"),
#         metadata.get("duration_seconds"),
#         metadata.get("duration_float"),
#     ]
#     duration = 0.0
#     for value in duration_fields:
#         if not value:
#             continue
#         try:
#             duration = float(value)
#             if duration > 0:
#                 break
#         except (TypeError, ValueError):
#             continue
#     if duration <= 0:
#         duration = float(target_frames)

#     video_id = metadata.get("id") or metadata.get("display_id") or "video"
#     safe_name = _sanitize_name(video_id)
#     timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
#     dest_dir = output_root / f"{safe_name}_{timestamp}"
#     dest_dir.mkdir(parents=True, exist_ok=True)
#     output_pattern = dest_dir / "frame_%03d.jpg"

#     yt_cmd = _build_yt_dlp_command(url)
#     ff_cmd = _build_ffmpeg_command(
#         duration_seconds=duration,
#         target_frames=target_frames,
#         output_pattern=output_pattern,
#     )

#     try:
#         yt_proc = subprocess.Popen(
#             yt_cmd,
#             stdout=subprocess.PIPE,
#             stderr=subprocess.PIPE,
#         )
#     except FileNotFoundError as exc:
#         raise RuntimeError("yt-dlp executable not found on PATH") from exc

#     stderr_output = ""
#     yt_return_code: int | None = None
#     try:
#         try:
#             subprocess.run(
#                 ff_cmd,
#                 stdin=yt_proc.stdout,
#                 stdout=subprocess.PIPE,
#                 stderr=subprocess.PIPE,
#                 check=True,
#             )
#         except FileNotFoundError as exc:
#             yt_proc.kill()
#             raise RuntimeError("ffmpeg executable not found on PATH") from exc
#         except subprocess.CalledProcessError as exc:
#             yt_proc.kill()
#             stderr_bytes = exc.stderr or b""
#             stderr_output = stderr_bytes.decode("utf-8", errors="ignore")
#             raise RuntimeError(f"ffmpeg failed: {stderr_output.strip()}") from exc
#     finally:
#         if yt_proc.stdout:
#             yt_proc.stdout.close()
#         if yt_proc.stderr:
#             stderr_output = yt_proc.stderr.read().decode("utf-8", errors="ignore").strip()
#             yt_proc.stderr.close()
#         try:
#             return_code = yt_proc.wait(timeout=5)
#         except subprocess.TimeoutExpired:
#             yt_proc.kill()
#             return_code = yt_proc.wait(timeout=5)
#         if return_code not in (0, None):
#             yt_return_code = return_code
#         else:
#             yt_return_code = 0

#     frames = sorted(dest_dir.glob("frame_*.jpg"))
#     if not frames:
#         raise RuntimeError(f"No frames written for URL: {url}")

#     if yt_return_code and yt_return_code not in (0, None):
#         lowered = (stderr_output or "").lower()
#         if "broken pipe" in lowered or "write data" in lowered:
#             print("Warning: yt-dlp reported a broken pipe after ffmpeg finished; continuing.")
#         else:
#             detail = f"yt-dlp exited with code {yt_return_code}"
#             if stderr_output:
#                 detail = f"{detail}: {stderr_output}"
#             raise RuntimeError(detail)

#     print(f"Wrote {len(frames)} frame(s) to {dest_dir}")
#     return dest_dir


# # Example usage (uncomment and set URL to test manually)
# extract_frames_from_url("https://www.facebook.com/reel/1597924308282025", target_frames=16)
