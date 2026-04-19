"""
superfunctions.http - HTTP abstraction layer.

Provides protocol-based HTTP abstractions for framework-agnostic code.

Example:
    >>> from superfunctions.http import Request, Response, RouteContext
    >>>
    >>> async def handler(request: Request, context: RouteContext) -> Response:
    ...     return Response(status=200, body={"message": "Hello"})
"""

from .openapi import OpenApiGenerationError, generate_openapi_document
from .types import (
    AuthRouteMeta,
    BadRequestError,
    ConflictError,
    CorsOptions,
    ForbiddenError,
    HttpError,
    HttpMethod,
    HttpNotImplementedError,
    InternalServerError,
    MethodNotAllowedError,
    Middleware,
    NotFoundError,
    OpenApiRouteMeta,
    Request,
    RequestHandler,
    Response,
    Route,
    RouteContext,
    RouteMeta,
    RouterOptions,
    ServiceUnavailableError,
    SetCookie,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableEntityError,
    get_route_openapi_meta,
    serialize_response_cookies,
    serialize_set_cookie,
)

__all__ = [
    # Core types
    "Request",
    "Response",
    "Route",
    "RouteMeta",
    "RouteContext",
    "RouterOptions",
    "HttpMethod",
    "RequestHandler",
    "Middleware",
    "SetCookie",
    "AuthRouteMeta",
    "OpenApiRouteMeta",
    "get_route_openapi_meta",
    "generate_openapi_document",
    "OpenApiGenerationError",
    "serialize_set_cookie",
    "serialize_response_cookies",
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
    "HttpNotImplementedError",
    "ServiceUnavailableError",
]
