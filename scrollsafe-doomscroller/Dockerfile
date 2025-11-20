# Dockerfile for ScrollSafe Doomscroller Workers
# Minimal image - frame extraction handled by resolver service

FROM python:3.12-bookworm

# Install build dependencies for Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY doomscroller_pipeline ./doomscroller_pipeline
COPY db ./db
COPY scripts ./scripts

# No cookies needed - frame extraction handled by resolver service

# Set Python path so imports work correctly
ENV PYTHONPATH=/app

# Health check - verify Celery app loads
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "from doomscroller_pipeline.celery_app import celery_app; print('OK')" || exit 1

# Default command (overridden by docker-compose)
CMD ["celery", "-A", "doomscroller_pipeline.celery_app", "worker", "-Q", "analyze", "-l", "info", "--concurrency=4"]
