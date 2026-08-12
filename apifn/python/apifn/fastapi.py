from __future__ import annotations

from typing import Any

from .config import ApifnConfig
from .openapi import augment_openapi


def introspect_fastapi(app: Any, config: ApifnConfig) -> dict[str, Any]:
    """Use FastAPI's native OpenAPI generation and augment with ApiFn metadata."""
    raw = app.openapi()
    return augment_openapi(raw, config)
