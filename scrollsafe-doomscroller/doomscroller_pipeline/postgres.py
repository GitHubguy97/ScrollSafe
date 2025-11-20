"""Postgres connection helpers."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg

from .config import settings


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(settings.database_url)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_cursor() -> Iterator[psycopg.Cursor]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            yield cur
            conn.commit()
