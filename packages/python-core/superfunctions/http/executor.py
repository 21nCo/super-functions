"""Framework-neutral route middleware execution."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional, cast

from .types import Response, Route, RouteContext


async def execute_route(
    route: Optional[Route],
    handler: Callable[..., Awaitable[Response]],
    request: Any,
    context: RouteContext,
) -> Response:
    """Execute route middleware in declaration order, then the handler."""
    next_handler: Callable[..., Awaitable[Response]] = handler
    for middleware in reversed((route.middleware or []) if route else []):
        downstream = next_handler

        async def invoke(
            current_request: Any,
            current_context: RouteContext,
            middleware: Any = middleware,
            downstream: Callable[..., Awaitable[Response]] = downstream,
        ) -> Response:
            return cast(
                Response,
                await middleware(current_request, current_context, downstream),
            )

        next_handler = invoke
    return cast(Response, await next_handler(request, context))


__all__ = ["execute_route"]
