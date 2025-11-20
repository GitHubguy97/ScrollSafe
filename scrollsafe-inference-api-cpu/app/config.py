from __future__ import annotations

import os
from dataclasses import dataclass
import dotenv

dotenv.load_dotenv()


def _int_from_env(key: str, default: int) -> int:
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"Environment variable {key} must be an integer") from None


@dataclass(frozen=True)
class Settings:
    model_id: str = os.getenv(
        "MODEL_ID", "haywoodsloan/ai-image-detector-dev-deploy"
    )
    api_key: str | None = os.getenv("API_KEY")
    max_batch: int = _int_from_env("MAX_BATCH", 32)
    max_concurrency: int = _int_from_env("MAX_CONCURRENCY", 1)
    port: int = _int_from_env("PORT", 8080)
    device_preference: str = os.getenv("DEVICE", "auto").lower()
    enable_autocast: bool = os.getenv("ENABLE_AUTOCAST", "1") != "0"
    hf_token: str | None = os.getenv("HF_TOKEN")

    @property
    def require_api_key(self) -> bool:
        return self.api_key is not None


settings = Settings()
