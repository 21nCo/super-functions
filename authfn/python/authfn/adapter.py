"""Adapter for superfunctions.db integration."""

# Re-export for convenience
from superfunctions.db import (
    Adapter,
    CreateParams,
    FindManyParams,
    FindOneParams,
    Operator,
    OrderBy,
    UpdateParams,
    WhereClause,
)

__all__ = [
    "Adapter",
    "CreateParams",
    "FindManyParams",
    "FindOneParams",
    "UpdateParams",
    "WhereClause",
    "OrderBy",
    "Operator",
]
