"""YouTube discovery provider backed by the Data API."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from . import VideoCandidate, register

load_dotenv()

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
REGIONS = [
    region.strip().upper()
    for region in os.getenv("YOUTUBE_REGIONS", "US").split(",")
    if region.strip()
]
MAX_RESULTS = min(int(os.getenv("YOUTUBE_MAX_RESULTS", "50")), 50)
MAX_PAGES_PER_SWEEP = int(os.getenv("YOUTUBE_MAX_PAGES_PER_SWEEP", "2"))
REQUEST_TIMEOUT = int(os.getenv("YOUTUBE_REQUEST_TIMEOUT", "10"))
DEFAULT_HOURS_BACK = int(os.getenv("YOUTUBE_HOURS_BACK", "48"))
SEARCH_QUERY = os.getenv("YOUTUBE_SEARCH_QUERY", "#shorts")
TOP_PER_REGION = int(os.getenv("YOUTUBE_TOP_PER_REGION", "75"))
POLITE_DELAY_SECONDS = float(os.getenv("YOUTUBE_POLITE_DELAY_SECONDS", "0.2"))

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

_session = requests.Session()
_retry = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
    respect_retry_after_header=True,
)
_session.mount("https://", HTTPAdapter(max_retries=_retry))
_HEADERS = {"Accept": "application/json"}


def _ensure_api_key() -> str:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("Missing YOUTUBE_API_KEY")
    return YOUTUBE_API_KEY


@register("youtube")
def discover_since(
    since: Optional[datetime] = None,
    limit: int = 50,
) -> List[VideoCandidate]:
    """Return ranked YouTube Shorts candidates."""

    hours_back = _hours_back_from_since(since)
    logger.info(
        "YouTube discovery sweep (regions=%s, hours_back=%s, limit=%s)",
        ",".join(REGIONS),
        hours_back,
        limit,
    )

    seen: set[Tuple[str, str]] = set()
    candidates: List[VideoCandidate] = []

    for region in REGIONS:
        region_items = _sweep_region(region=region, hours_back=hours_back)
        for item in region_items:
            video_id = item.get("id")
            if not video_id:
                continue

            key = (region, video_id)
            if key in seen:
                continue
            seen.add(key)

            candidate = _build_candidate(item, region)
            candidates.append(candidate)

    candidates.sort(key=lambda c: c.get("views_per_hour", 0.0), reverse=True)

    if limit and limit > 0:
        candidates = candidates[:limit]

    logger.info("YouTube provider produced %d candidates", len(candidates))
    return candidates


def _sweep_region(*, region: str, hours_back: int) -> List[Dict]:
    page_token: Optional[str] = None
    all_items: List[Dict] = []
    pages = 0

    while pages < MAX_PAGES_PER_SWEEP and len(all_items) < TOP_PER_REGION:
        try:
            items, page_token = _fetch_shorts_page(
                region=region,
                hours_back=hours_back,
                page_token=page_token,
                session=_session,
            )
        except RuntimeError as exc:
            logger.warning("[%s] API error during sweep: %s", region, exc)
            break

        if not items:
            break

        all_items.extend(items)
        pages += 1

        if not page_token:
            break

        if POLITE_DELAY_SECONDS:
            time.sleep(POLITE_DELAY_SECONDS)

    all_items.sort(
        key=lambda item: _compute_views_per_hour(item),
        reverse=True,
    )

    return all_items[:TOP_PER_REGION]


def _fetch_shorts_page(
    *,
    region: str,
    hours_back: int,
    page_token: Optional[str],
    session: requests.Session,
) -> Tuple[List[Dict], Optional[str]]:
    video_ids, next_token = _search_short_ids(
        region=region,
        query=SEARCH_QUERY,
        hours_back=hours_back,
        page_token=page_token,
        session=session,
    )

    if not video_ids:
        return [], next_token

    enriched = _enrich_videos(video_ids, session=session)
    return enriched, next_token


def _search_short_ids(
    *,
    region: str,
    query: str,
    hours_back: int,
    page_token: Optional[str],
    session: requests.Session,
) -> Tuple[List[str], Optional[str]]:
    params = {
        "key": _ensure_api_key(),
        "part": "snippet",
        "type": "video",
        "q": query,
        "videoDuration": "short",
        "order": "viewCount",
        "publishedAfter": _iso_timestamp(hours_back),
        "regionCode": region,
        "maxResults": MAX_RESULTS,
    }

    if page_token:
        params["pageToken"] = page_token

    resp = session.get(_SEARCH_URL, params=params, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
    if resp.status_code in (401, 403):
        raise RuntimeError(f"Auth/quota error ({resp.status_code}): {resp.text[:160]}")
    resp.raise_for_status()

    data: Dict = resp.json()
    items = data.get("items", [])

    video_ids: List[str] = []
    seen: set[str] = set()
    for item in items:
        video_id = item.get("id", {}).get("videoId")
        if video_id and video_id not in seen:
            seen.add(video_id)
            video_ids.append(video_id)

    return video_ids, data.get("nextPageToken")


def _enrich_videos(
    video_ids: Sequence[str],
    *,
    session: requests.Session,
) -> List[Dict]:
    if not video_ids:
        return []

    params = {
        "key": _ensure_api_key(),
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(video_ids[:50]),
        "maxResults": 50,
    }

    resp = session.get(_VIDEOS_URL, params=params, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
    if resp.status_code in (401, 403):
        raise RuntimeError(f"Auth/quota error ({resp.status_code}): {resp.text[:160]}")
    resp.raise_for_status()

    data: Dict = resp.json()
    return data.get("items", [])


def _build_candidate(item: Dict, region: str) -> VideoCandidate:
    snippet = item.get("snippet", {})
    video_id = item.get("id")
    title = snippet.get("title") or ""
    channel_title = snippet.get("channelTitle") or ""
    published_at = snippet.get("publishedAt")

    views_per_hour = _compute_views_per_hour(item)
    view_count = _safe_int(item.get("statistics", {}).get("viewCount"))

    return VideoCandidate(
        {
            "platform": "youtube",
            "video_id": video_id,
            "url": f"https://www.youtube.com/shorts/{video_id}",
            "title": title,
            "channel": channel_title,
            "published_at": published_at,
            "region": region,
            "views_per_hour": views_per_hour,
            "view_count": view_count,
        }
    )


def _compute_views_per_hour(item: Dict) -> float:
    snippet = item.get("snippet", {})
    elapsed_hours = _hours_since_published(snippet)
    view_count = _safe_int(item.get("statistics", {}).get("viewCount"))
    if elapsed_hours <= 0:
        return float(view_count)
    return view_count / elapsed_hours


def _hours_back_from_since(since: Optional[datetime]) -> int:
    if not since:
        return DEFAULT_HOURS_BACK
    now = datetime.now(timezone.utc)
    delta = now - since
    hours = max(int(delta.total_seconds() / 3600) or 1, 1)
    return max(hours, 1)


def _hours_since_published(snippet: Dict) -> float:
    published_at = snippet.get("publishedAt")
    if not published_at:
        return 1.0

    try:
        dt_value = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except ValueError:
        return 1.0

    now = datetime.now(timezone.utc)
    hours = (now - dt_value).total_seconds() / 3600.0
    return max(hours, 1.0)


def _iso_timestamp(hours_back: int) -> str:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    return cutoff.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _safe_int(value: Optional[object]) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


__all__ = ["discover_since"]
