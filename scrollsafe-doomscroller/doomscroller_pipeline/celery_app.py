"""Celery application for doomscroller tasks."""

from __future__ import annotations

from celery import Celery

from .config import settings


celery_app = Celery(
    "doomscroller_pipeline",
    broker=settings.celery_broker_url,
)

celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="analyze",
    task_default_priority=5,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    include=[
        "doomscroller_pipeline.tasks.analyzer",
        "doomscroller_pipeline.tasks.scheduler",
    ],
    beat_schedule={
        "wake-inference": {
            "task": "doomscroller_pipeline.tasks.scheduler.wake_inference",
            "schedule": settings.health_check_interval_seconds,
        },
        "run-discovery-job": {
            "task": "doomscroller_pipeline.tasks.scheduler.run_discovery_job",
            "schedule": settings.discovery_interval_seconds,
        },
    },
    timezone="UTC",
)
