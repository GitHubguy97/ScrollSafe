"""
Lightweight client helpers for calling the ScrollSafe inference API from the backend.
"""

from __future__ import annotations

from typing import Iterable, List, Sequence

import requests


def classify_frames(
    api_url: str,
    api_key: str,
    frame_bytes: Sequence[bytes],
    timeout: float = 15.0,
) -> dict:
    """
    Send a batch of frames to the inference endpoint and return the JSON payload.

    Parameters
    ----------
    api_url:
        Base URL of the inference service (e.g. https://your-endpoint.hf.space).
    api_key:
        Secret that must match the server-side `API_KEY` environment variable.
    frame_bytes:
        Ordered iterable of JPEG-encoded frames.
    timeout:
        Request timeout in seconds. Defaults to 15s.
    """

    if not frame_bytes:
        raise ValueError("frame_bytes cannot be empty")

    files: List[tuple[str, tuple[str, bytes, str]]] = []
    for idx, blob in enumerate(frame_bytes):
        files.append(("files", (f"frame_{idx:03d}.jpg", blob, "image/jpeg")))

    response = requests.post(
        f"{api_url.rstrip('/')}/v1/infer",
        headers={"X-API-Key": api_key},
        files=files,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()
