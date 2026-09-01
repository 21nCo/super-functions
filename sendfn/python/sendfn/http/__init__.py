"""HTTP API package for sendfn.

This package provides framework-agnostic routes eagerly and optional framework
adapters lazily so base package imports do not require web extras.
"""

from typing import Any

from .routes import create_sendfn_routes

__all__ = ["create_sendfn_routes", "create_sendfn_router"]


def create_sendfn_router(*args: Any, **kwargs: Any) -> Any:
    """Create the optional FastAPI router without importing FastAPI eagerly."""
    from .fastapi import create_sendfn_router as create_router

    return create_router(*args, **kwargs)
