from __future__ import annotations

import io
import time
from typing import Dict, List, Sequence

import torch
from PIL import Image
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
)

from .config import settings


class ModelService:
    """Lazy-loads the classifier and exposes a batched predict method."""

    def __init__(self) -> None:
        self.device = self._resolve_device()
        auth_token = settings.hf_token

        self.processor = AutoImageProcessor.from_pretrained(
            settings.model_id,
            use_auth_token=auth_token,
        )
        self.model = AutoModelForImageClassification.from_pretrained(
            settings.model_id,
            use_auth_token=auth_token,
        )
        self.model.eval()
        self.model.to(self.device)

        self.id2label = dict(sorted(self.model.config.id2label.items()))
        self.labels = [self.id2label[k] for k in sorted(self.id2label.keys(), key=int)]

        self._warmup_done = False
        self._warmup_model()

    @staticmethod
    def _resolve_device() -> torch.device:
        preference = settings.device_preference
        if preference == "cuda":
            if torch.cuda.is_available():
                return torch.device("cuda")
            raise RuntimeError("CUDA requested but not available")
        if preference == "cpu":
            return torch.device("cpu")
        # auto
        return torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")

    @property
    def warmup_completed(self) -> bool:
        return self._warmup_done

    def _warmup_model(self) -> None:
        try:
            dummy = Image.new(
                "RGB",
                (self.processor.size["width"], self.processor.size["height"]),
                "black",
            )
            inputs = self.processor(images=[dummy], return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                if settings.enable_autocast and self.device.type == "cuda":
                    with torch.amp.autocast(device_type="cuda"):
                        _ = self.model(**inputs)
                else:
                    _ = self.model(**inputs)
        finally:
            if self.device.type == "cuda":
                torch.cuda.synchronize()
            self._warmup_done = True

    @staticmethod
    def _load_image(data: bytes) -> Image.Image:
        with Image.open(io.BytesIO(data)) as img:
            return img.convert("RGB")

    def predict(self, images: Sequence[bytes]) -> Dict[str, object]:
        if not images:
            raise ValueError("At least one image is required")

        pil_images: List[Image.Image] = [self._load_image(blob) for blob in images]
        batch_t0 = time.perf_counter()
        inputs = self.processor(images=pil_images, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            if settings.enable_autocast and self.device.type == "cuda":
                with torch.amp.autocast(device_type="cuda"):
                    outputs = self.model(**inputs)
            else:
                outputs = self.model(**inputs)

        if self.device.type == "cuda":
            torch.cuda.synchronize()

        batch_time_ms = (time.perf_counter() - batch_t0) * 1000.0
        probabilities = torch.softmax(outputs.logits, dim=-1)
        scores = probabilities.detach().cpu().tolist()

        results: List[Dict[str, float]] = []
        for score_vec in scores:
            label_scores = {label: float(score_vec[idx]) for idx, label in enumerate(self.labels)}
            results.append(label_scores)

        per_item_ms = batch_time_ms / len(results)
        inference_times = [per_item_ms for _ in results]

        return {
            "label_scores": results,
            "batch_time_ms": batch_time_ms,
            "inference_times_ms": inference_times,
        }
