"""HTTP API package for sendfn.

This package provides framework-agnostic routes eagerly and optional framework
adapters lazily so base package imports do not require web extras.
"""

from .routes import create_sendfn_routes

__all__ = ["create_sendfn_routes", "create_sendfn_router"]


def __getattr__(name: str):
    if name == "create_sendfn_router":
        from .fastapi import create_sendfn_router

        return create_sendfn_router
    raise AttributeError(f"module 'sendfn.http' has no attribute {name!r}")
