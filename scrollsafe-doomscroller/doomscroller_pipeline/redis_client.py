"""Reusable Redis connections for the doomscroller app."""

from __future__ import annotations

import redis

from .config import settings


def get_redis() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_app_url, decode_responses=True)
