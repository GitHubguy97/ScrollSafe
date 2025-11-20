"""Run discovery providers and enqueue analysis tasks."""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Iterable, List

from dotenv import load_dotenv

from doomscroller_pipeline.providers import PROVIDERS, VideoCandidate
from scripts.enqueue import enqueue_video


def _init_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )


def run_discovery_once(
    *,
    limit_per_provider: int,
    total_limit: int,
    since_hours: int | None,
    priority: int,
) -> int:
    if since_hours is not None and since_hours > 0:
        since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    else:
        since = None

    raw_candidates: List[VideoCandidate] = []

    for name, provider in PROVIDERS.items():
        logging.info("Running provider '%s' (limit=%s)", name, limit_per_provider)
        try:
            items = provider(since=since, limit=limit_per_provider)
        except Exception:
            logging.exception("Provider '%s' failed", name)
            continue
        raw_candidates.extend(items or [])

    best_by_key: dict[tuple[str, str], VideoCandidate] = {}
    for candidate in raw_candidates:
        platform = candidate.get("platform")
        video_id = candidate.get("video_id")
        if not platform or not video_id:
            continue

        key = (platform, video_id)
        current = best_by_key.get(key)
        if current is None or candidate.get("views_per_hour", 0.0) > current.get(
            "views_per_hour", 0.0
        ):
            best_by_key[key] = candidate

    ranked = sorted(
        best_by_key.values(),
        key=lambda c: c.get("views_per_hour", 0.0),
        reverse=True,
    )
    if total_limit and total_limit > 0:
        ranked = ranked[:total_limit]

    enqueued = 0
    for candidate in ranked:
        enqueue_video(
            candidate["platform"],
            candidate["video_id"],
            candidate["url"],
            title=candidate.get("title"),
            channel=candidate.get("channel"),
            published_at=candidate.get("published_at"),
            region=candidate.get("region"),
            views_per_hour=candidate.get("views_per_hour"),
            priority=priority,
        )
        enqueued += 1

    return enqueued


def main() -> None:
    load_dotenv()
    _init_logging()

    parser = argparse.ArgumentParser(description="Run discovery providers and enqueue results.")
    parser.add_argument(
        "--limit-per-provider",
        type=int,
        default=50,
        help="Maximum candidates to pull from each provider (default: 50)",
    )
    parser.add_argument(
        "--total-limit",
        type=int,
        default=100,
        help="Maximum candidates to enqueue after global rerank (default: 100)",
    )
    parser.add_argument(
        "--priority",
        type=int,
        default=5,
        help="Celery priority to use for enqueued tasks (default: 5)",
    )
    parser.add_argument(
        "--since-hours",
        type=int,
        help="Optional window in hours to look back when querying providers.",
    )
    args = parser.parse_args()

    enqueued = run_discovery_once(
        limit_per_provider=args.limit_per_provider,
        since_hours=args.since_hours,
        total_limit=args.total_limit,
        priority=args.priority,
    )

    logging.info(
        "Discovery complete: enqueued %d videos (limit/provider=%d total_limit=%d)",
        enqueued,
        args.limit_per_provider,
        args.total_limit,
    )


if __name__ == "__main__":
    main()
