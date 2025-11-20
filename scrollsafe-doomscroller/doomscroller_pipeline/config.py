"""Central configuration loader for the doomscroller pipeline."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv


load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    celery_broker_url: str
    redis_app_url: str
    infer_api_url: str
    infer_api_key: str
    hf_token: str
    resolver_url: str
    infer_target_frames: int
    infer_request_timeout: float
    idempotency_ttl_seconds: int
    idempotency_stamp_ttl_seconds: int
    discovery_dedupe_ttl_seconds: int
    frame_extract_timeout: int
    log_level: str
    health_check_interval_seconds: int
    health_check_timeout: float
    discovery_interval_seconds: int
    discovery_limit_per_provider: int
    discovery_total_limit: int
    discovery_priority: int
    discovery_since_hours: Optional[int]
    discovery_retry_delay_seconds: int
    discovery_max_retries: int


def _build_settings() -> Settings:
    raw_since_hours = os.getenv("DISCOVERY_SINCE_HOURS")
    since_hours = int(raw_since_hours) if raw_since_hours not in (None, "", "None") else None

    return Settings(
        database_url=_require("DATABASE_URL"),
        celery_broker_url=_require("CELERY_BROKER_URL"),
        redis_app_url=_require("REDIS_APP_URL"),
        infer_api_url=_require("INFER_API_URL"),
        infer_api_key=_require("INFER_API_KEY"),
        hf_token=_require("HUGGING_FACE_API_KEY"),
        resolver_url=os.getenv("DOOMSCROLLER_RESOLVER_URL", "http://localhost:5001"),
        infer_target_frames=int(os.getenv("INFER_TARGET_FRAMES", "16")),
        infer_request_timeout=float(os.getenv("INFER_REQUEST_TIMEOUT", "180")),
        idempotency_ttl_seconds=int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400")),
        idempotency_stamp_ttl_seconds=int(os.getenv("IDEMPOTENCY_STAMP_TTL_SECONDS", "259200")),
        discovery_dedupe_ttl_seconds=int(os.getenv("DISCOVERY_DEDUPE_TTL_SECONDS", "86400")),
        frame_extract_timeout=int(os.getenv("FRAME_EXTRACT_TIMEOUT", "180")),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        health_check_interval_seconds=int(os.getenv("HEALTH_CHECK_INTERVAL_SECONDS", "30")),
        health_check_timeout=float(os.getenv("HEALTH_CHECK_TIMEOUT", "5")),
        discovery_interval_seconds=int(os.getenv("DISCOVERY_INTERVAL_SECONDS", "120")),
        discovery_limit_per_provider=int(os.getenv("DISCOVERY_LIMIT_PER_PROVIDER", "100")),
        discovery_total_limit=int(os.getenv("DISCOVERY_TOTAL_LIMIT", "100")),
        discovery_priority=int(os.getenv("DISCOVERY_PRIORITY", "5")),
        discovery_since_hours=since_hours,
        discovery_retry_delay_seconds=int(os.getenv("DISCOVERY_RETRY_DELAY_SECONDS", "90")),
        discovery_max_retries=int(os.getenv("DISCOVERY_MAX_RETRIES", "3")),
    )


settings = _build_settings()
