from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class InferenceResult(BaseModel):
    label_scores: Dict[str, float]
    inference_time_ms: float = Field(..., ge=0.0)


class InferenceResponse(BaseModel):
    model: Dict[str, str]
    batch_time_ms: float = Field(..., ge=0.0)
    results: List[InferenceResult]


class HealthResponse(BaseModel):
    status: str = "ok"
    model_id: str
    device: str
    max_batch: int
    max_concurrency: int
    warmup_completed: bool


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
