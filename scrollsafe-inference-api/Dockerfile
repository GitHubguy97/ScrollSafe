# syntax=docker/dockerfile:1.6

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python

# Install pip tools first to allow pinned wheel installs.
RUN python -m pip install --upgrade pip setuptools wheel

WORKDIR /app

COPY requirements.txt ./requirements.txt

# Install PyTorch with CUDA wheels followed by remaining dependencies.
RUN pip install --upgrade --extra-index-url https://download.pytorch.org/whl/cu121 \
    torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1 \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV MODEL_ID="haywoodsloan/ai-image-detector-dev-deploy" \
    PORT=8080 \
    MAX_BATCH=32 \
    MAX_CONCURRENCY=1

EXPOSE 8080

CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
