# syntax=docker/dockerfile:1.6

FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1 \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV MODEL_ID="haywoodsloan/ai-image-detector-dev-deploy" \
    PORT=8080 \
    MAX_BATCH=32 \
    MAX_CONCURRENCY=1 \
    DEVICE=cpu \
    ENABLE_AUTOCAST=0

EXPOSE 8080

CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
