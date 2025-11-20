"""Provider registry for discovery sources."""

from __future__ import annotations

from typing import Dict, List


class VideoCandidate(dict):
    """Lightweight dict wrapper for provider results."""

    @property
    def platform(self) -> str:
        return self["platform"]

    @property
    def video_id(self) -> str:
        return self["video_id"]


PROVIDERS = {}


def register(name: str):
    def decorator(func):
        PROVIDERS[name] = func
        return func

    return decorator


def get_provider(name: str):
    return PROVIDERS.get(name)


def _auto_import_providers() -> None:
    """Import bundled providers so they register themselves."""
    from importlib import import_module

    bundled = ["youtube"]
    for module_name in bundled:
        try:
            import_module(f"{__name__}.{module_name}")
        except Exception as exc:  # pragma: no cover - defensive
            import logging

            logging.getLogger(__name__).warning(
                "Failed to import provider %s: %s", module_name, exc
            )


_auto_import_providers()


__all__ = ["register", "get_provider", "VideoCandidate", "PROVIDERS"]
