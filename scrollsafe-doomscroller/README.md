# ScrollSafe Doomscroller Pipeline

This package hosts the background workers, queue producers, and data
stores that keep the doomscroller feature fresh. It is designed to run
alongside the existing ScrollSafe backend but can be developed and tested
locally on its own using the provided Docker Compose file.

## Components

- **infra/docker-compose.yaml** – spins up Postgres and Redis locally.
- **scrollsafe_doomscroller/** – Python package containing the Celery app,
  configuration helpers, and tasks.
- **db/schema.sql** – source-of-truth DDL for Postgres tables.
- **scripts/** – small utilities (e.g., apply schema, enqueue test job).

## Quick start

1. Start infrastructure:

   ```bash
   cd infra
   docker compose up -d
   ```

2. Create a virtual environment and install requirements:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and fill in the required URLs and keys.

4. Apply the database schema:

   ```bash
   python scripts/apply_schema.py
   ```

5. Enqueue a test video and run the analyzer worker:

   ```bash
   python scripts/enqueue.py --platform youtube --video-id <VIDEO_ID>
   celery -A scrollsafe_doomscroller.celery_app worker -Q analyze -l info
   ```

## Next steps

Add provider sweeps (Celery beat), integrate with the existing backend
to serve cached results, and deploy the analyzer worker alongside the
infrastructure stack.
