"""FastAPI adapter for sendfn HTTP routes.

This module provides FastAPI integration using superfunctions_fastapi adapter.
"""

from typing import Optional

from ..errors import SendfnError
from ..client import Sendfn
from .routes import create_sendfn_routes

try:
    from superfunctions_fastapi import create_router as create_fastapi_router
except ImportError as exc:
    error = SendfnError(
        "FastAPI integration requires the `fastapi` extra",
        code="SENDFN_OPTIONAL_DEPENDENCY_MISSING",
        retryable=False,
    )
    raise error from exc


def create_sendfn_router(
    sendfn_client: Sendfn,
    admin_key: Optional[str] = None,
    prefix: str = "",
    tags: Optional[list[str]] = None,
):
    """Create a FastAPI router with sendfn endpoints.

    This function uses superfunctions abstractions to create a FastAPI router,
    making it compatible with the superfunctions ecosystem patterns.

    Args:
        sendfn_client: Initialized Sendfn client
        admin_key: Optional admin API key for authentication
        prefix: URL prefix for all routes
        tags: Optional tags for OpenAPI documentation

    Returns:
        FastAPI APIRouter instance

    Example:
        ```python
        from fastapi import FastAPI
        from sendfn import Sendfn, SendfnConfig
        from sendfn.http.fastapi import create_sendfn_router

        app = FastAPI()
        client = Sendfn(SendfnConfig(database=adapter, email=email_config))

        # Create router using superfunctions abstractions
        router = create_sendfn_router(
            client,
            admin_key="secret-key",
            prefix="/api/sendfn",
            tags=["sendfn"]
        )

        app.include_router(router)
        ```
    """
    # Create generic routes using superfunctions.http
    routes = create_sendfn_routes(sendfn_client, admin_key)

    # Convert to FastAPI router using superfunctions_fastapi adapter
    return create_fastapi_router(routes, prefix=prefix, tags=tags or ["sendfn"])
