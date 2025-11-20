from __future__ import annotations

import asyncio
from typing import List, Optional

import uvicorn
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from .config import settings
from .model import ModelService
from .schemas import ErrorResponse, HealthResponse, InferenceResponse, InferenceResult


app = FastAPI(
    title="ScrollSafe Inference API",
    version="0.1.0",
    description=(
        "Batched inference endpoint for haywoodsloan/ai-image-detector-dev-deploy. "
        "Upload image frames via multipart/form-data."
    ),
)

_model_service: Optional[ModelService] = None
_semaphore: Optional[asyncio.Semaphore] = None


def get_model_service() -> ModelService:
    if _model_service is None:
        raise RuntimeError("ModelService not ready")
    return _model_service


def get_semaphore() -> asyncio.Semaphore:
    if _semaphore is None:
        raise RuntimeError("Semaphore not initialised")
    return _semaphore


async def verify_api_key(x_api_key: Optional[str] = Header(None)) -> None:
    if not settings.require_api_key:
        return
    if x_api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


@app.on_event("startup")
async def _startup() -> None:
    global _model_service, _semaphore
    loop = asyncio.get_running_loop()
    _model_service = await loop.run_in_executor(None, ModelService)
    _semaphore = asyncio.Semaphore(settings.max_concurrency)


@app.get(
    "/healthz",
    response_model=HealthResponse,
    tags=["system"],
)
async def health() -> HealthResponse:
    service = get_model_service()
    return HealthResponse(
        status="ok",
        model_id=settings.model_id,
        device=str(service.device),
        max_batch=settings.max_batch,
        max_concurrency=settings.max_concurrency,
        warmup_completed=service.warmup_completed,
    )


@app.post(
    "/v1/infer",
    response_model=InferenceResponse,
    tags=["inference"],
)
async def infer(
    files: List[UploadFile] = File(..., description="Image frames to classify."),
    _: None = Depends(verify_api_key),
) -> InferenceResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image file must be provided",
        )
    if len(files) > settings.max_batch:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Too many frames. Maximum allowed is {settings.max_batch}.",
        )

    image_bytes: List[bytes] = []
    for idx, upload in enumerate(files, start=1):
        data = await upload.read()
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{upload.filename or idx}' is empty.",
            )
        image_bytes.append(data)

    service = get_model_service()
    semaphore = get_semaphore()

    async with semaphore:
        loop = asyncio.get_running_loop()
        output = await loop.run_in_executor(None, service.predict, image_bytes)

    label_scores = output["label_scores"]
    per_item_ms = output["inference_times_ms"]
    batch_time = output["batch_time_ms"]

    results = [
        InferenceResult(label_scores=scores, inference_time_ms=round(time_ms, 4))
        for scores, time_ms in zip(label_scores, per_item_ms)
    ]

    return InferenceResponse(
        model={
            "id": settings.model_id,
            "device": str(service.device),
        },
        batch_time_ms=round(batch_time, 4),
        results=results,
    )


@app.exception_handler(ValueError)
async def value_error_handler(_: Exception, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ErrorResponse(detail=str(exc), code="invalid_input").dict(),
    )


def run() -> None:
    """Convenience entry point."""
    uvicorn.run(
        "app.server:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
        workers=1,
    )


"""
Backend usage example (Python requests):

import requests

def classify_frames(api_url: str, api_key: str, frames: list[bytes]) -> dict:
    files = []
    for idx, data in enumerate(frames):
        files.append(("files", (f"frame_{idx:03d}.jpg", data, "image/jpeg")))

    response = requests.post(
        f"{api_url}/v1/infer",
        headers={"X-API-Key": api_key},
        files=files,
        timeout=15,
    )
    response.raise_for_status()
    return response.json()
"""

