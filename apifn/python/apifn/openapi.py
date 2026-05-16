from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .config import ApifnConfig


def augment_openapi(spec: dict[str, Any], config: ApifnConfig) -> dict[str, Any]:
    """Return an augmented copy of an OpenAPI document with ApiFn extensions."""
    out = deepcopy(spec)
    out.setdefault("openapi", "3.1.0")

    info = out.setdefault("info", {})
    info.setdefault("title", config.title)
    info.setdefault("version", config.version)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    out["x-apifn-generated-by"] = "apifn-python"
    out["x-apifn-generated-at"] = generated_at
    out["x-apifn-config"] = {
        "title": config.title,
        "version": config.version,
        "base_url": config.base_url,
        **config.metadata,
    }
    return out
