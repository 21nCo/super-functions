"""
superfunctions.http - HTTP abstraction layer.

Provides protocol-based HTTP abstractions for framework-agnostic code.

Example:
    >>> from superfunctions.http import Request, Response, RouteContext
    >>> 
    >>> async def handler(request: Request, context: RouteContext) -> Response:
    ...     return Response(status=200, body={"message": "Hello"})
"""

from .types import (
    BadRequestError,
    ConflictError,
    CorsOptions,
    ForbiddenError,
    HttpError,
    HttpMethod,
    InternalServerError,
    MethodNotAllowedError,
    Middleware,
    NotFoundError,
    NotImplementedError,
    Request,
    RequestHandler,
    Response,
    Route,
    RouteContext,
    RouterOptions,
    ServiceUnavailableError,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableEntityError,
)

__all__ = [
    # Core types
    "Request",
    "Response",
    "Route",
    "RouteContext",
    "RouterOptions",
    "HttpMethod",
    "RequestHandler",
    "Middleware",
    # CORS
    "CorsOptions",
    # Errors
    "HttpError",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "NotFoundError",
    "MethodNotAllowedError",
    "ConflictError",
    "UnprocessableEntityError",
    "TooManyRequestsError",
    "InternalServerError",
    "NotImplementedError",
    "ServiceUnavailableError",
]
