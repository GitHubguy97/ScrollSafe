"""Scheduled tasks for discovery and health checks."""

from __future__ import annotations

import logging
from typing import Optional

import requests
from celery import shared_task

from ..config import settings

logger = logging.getLogger(__name__)

HEALTH_ENDPOINT = settings.infer_api_url.rstrip("/") + "/healthz"


def _check_inference_health(raise_on_failure: bool = False) -> bool:
    try:
        response = requests.get(
            HEALTH_ENDPOINT,
            timeout=settings.health_check_timeout,
            headers={"Authorization": f"Bearer {settings.hf_token}"},
        )
        response.raise_for_status()
        logger.info(
            "Inference health check succeeded with status %s",
            response.status_code,
        )
        return True
    except Exception as exc:
        logger.warning("Inference health check failed: %s", exc)
        if raise_on_failure:
            raise RuntimeError("Inference health check failed") from exc
        return False


@shared_task(name="doomscroller_pipeline.tasks.scheduler.wake_inference")
def wake_inference() -> bool:
    """Ping the inference service to wake it from scale-to-zero."""
    return _check_inference_health(raise_on_failure=True)


@shared_task(
    bind=True,
    name="doomscroller_pipeline.tasks.scheduler.run_discovery_job",
    autoretry_for=(RuntimeError,),
    retry_kwargs={"max_retries": settings.discovery_max_retries},
)
def run_discovery_job(self) -> Optional[int]:
    """Run discovery after ensuring the inference API is healthy."""
    from pathlib import Path
    import sys

    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from scripts.discover import run_discovery_once

    try:
        _check_inference_health(raise_on_failure=True)
    except RuntimeError as exc:
        delay = settings.discovery_retry_delay_seconds
        logger.warning(
            "Inference not ready; retrying discovery in %s seconds", delay
        )
        raise self.retry(exc=exc, countdown=delay)

    logger.info("Starting discovery sweep")
    enqueued = run_discovery_once(
        limit_per_provider=settings.discovery_limit_per_provider,
        total_limit=settings.discovery_total_limit,
        since_hours=settings.discovery_since_hours,
        priority=settings.discovery_priority,
    )
    logger.info("Discovery sweep finished; enqueued %s videos", enqueued)
    return enqueued
