"""Apply the Postgres schema for the doomscroller pipeline."""

from __future__ import annotations

import pathlib

import psycopg
from dotenv import load_dotenv

from doomscroller_pipeline.config import settings


def apply_schema() -> None:
    schema_path = pathlib.Path(__file__).resolve().parents[1] / "db" / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")

    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def main() -> None:
    load_dotenv()
    apply_schema()
    print("Schema applied successfully.")


if __name__ == "__main__":  # pragma: no cover
    main()
