from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ApifnConfig:
    title: str = "ApiFn API"
    version: str = "1.0.0"
    base_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
