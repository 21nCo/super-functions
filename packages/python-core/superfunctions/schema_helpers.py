"""Shared schema helper aliases for Python superfunctions packages."""

from __future__ import annotations

from typing import Any, Dict

from .db import TableSchema

SchemaDefinition = Dict[str, Any]

__all__ = ["SchemaDefinition", "TableSchema"]
