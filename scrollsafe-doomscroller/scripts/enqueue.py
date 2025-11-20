"""Utility to enqueue a single video for analysis."""

from __future__ import annotations

import argparse
from typing import Any, Dict, Optional

from celery import Celery
from dotenv import load_dotenv

from doomscroller_pipeline.config import settings


def build_celery() -> Celery:
    app = Celery(
        "dooms_enqueue",
        broker=settings.celery_broker_url,
    )
    return app


_celery_app: Optional[Celery] = None


def get_celery_app() -> Celery:
    global _celery_app
    if _celery_app is None:
        _celery_app = build_celery()
    return _celery_app


def enqueue_task(celery_app: Celery, payload: Dict[str, Any], priority: int) -> None:
    celery_app.send_task(
        "doomscroller_pipeline.tasks.analyzer.process_video",
        kwargs=payload,
        queue="analyze",
        priority=priority,
    )


def enqueue_video(
    platform: str,
    video_id: str,
    url: str,
    *,
    title: Optional[str] = None,
    channel: Optional[str] = None,
    published_at: Optional[str] = None,
    region: Optional[str] = None,
    views_per_hour: Optional[float] = None,
    priority: int = 5,
) -> None:
    """Convenience wrapper to enqueue a single video for analysis."""
    celery_app = get_celery_app()
    payload = {
        "platform": platform,
        "video_id": video_id,
        "url": url,
        "title": title,
        "channel": channel,
        "published_at": published_at,
        "region": region,
        "views_per_hour": views_per_hour,
    }
    payload = {key: value for key, value in payload.items() if value is not None}
    enqueue_task(celery_app, payload, priority)


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Enqueue a doomscroller analysis task.")
    parser.add_argument("--platform", required=True, help="Platform identifier (e.g., youtube)")
    parser.add_argument("--video-id", required=True, help="Platform-specific video ID")
    parser.add_argument("--url", required=True, help="Full URL for the video to analyze")
    parser.add_argument("--url", required=True, help="Full URL for the video to analyze")
    parser.add_argument("--title", help="Video title (optional)")
    parser.add_argument("--channel", help="Channel/creator name (optional)")
    parser.add_argument("--published-at", dest="published_at", help="Published timestamp (ISO 8601, optional)")
    parser.add_argument("--region", help="Region code (optional)")
    parser.add_argument("--views-per-hour", type=float, dest="views_per_hour", help="Estimated views per hour (optional)")
    parser.add_argument("--priority", type=int, default=5, help="Celery priority (0-9)")
    args = parser.parse_args()

    enqueue_video(
        args.platform,
        args.video_id,
        args.url,
        title=args.title,
        channel=args.channel,
        published_at=args.published_at,
        region=args.region,
        views_per_hour=args.views_per_hour,
        priority=args.priority,
    )
    print(f"Enqueued {args.platform}:{args.video_id} with priority {args.priority}.")


if __name__ == "__main__":  # pragma: no cover
    main()
