"""Core type definitions for the HTTP abstraction layer."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, Protocol, Union

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# HTTP Methods
# ============================================================================


class HttpMethod(str, Enum):
    """HTTP methods."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"


# ============================================================================
# Request/Response Abstractions
# ============================================================================


class Request(Protocol):
    """Generic HTTP request protocol."""

    @property
    def method(self) -> str:
        """HTTP method."""
        ...

    @property
    def path(self) -> str:
        """Request path."""
        ...

    @property
    def headers(self) -> Dict[str, str]:
        """Request headers."""
        ...

    @property
    def query_params(self) -> Dict[str, Any]:
        """Query parameters."""
        ...

    async def json(self) -> Any:
        """Parse JSON body."""
        ...

    async def body(self) -> bytes:
        """Get raw body."""
        ...

    async def text(self) -> str:
        """Get body as text."""
        ...


class SetCookie(BaseModel):
    """Structured Set-Cookie definition."""

    name: str
    value: str
    path: str = "/"
    domain: Optional[str] = None
    secure: bool = True
    http_only: bool = Field(True, alias="httpOnly")
    same_site: Literal["lax", "strict", "none"] = Field("lax", alias="sameSite")
    max_age: Optional[int] = Field(None, alias="maxAge")
    expires: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class Response(BaseModel):
    """Generic HTTP response."""

    status: int = 200
    headers: Dict[str, str] = Field(default_factory=dict)
    cookies: List[SetCookie] = Field(default_factory=list)
    body: Union[str, bytes, Dict[str, Any], List[Any], None] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ============================================================================
# Route Context
# ============================================================================


class RouteContext(BaseModel):
    """Context passed to route handlers."""

    params: Dict[str, str] = Field(default_factory=dict)
    query: Dict[str, Any] = Field(default_factory=dict)
    headers: Dict[str, str] = Field(default_factory=dict)
    url: str
    method: str

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ============================================================================
# Handlers and Middleware
# ============================================================================

RequestHandler = Callable[[Request, RouteContext], Awaitable[Response]]
Middleware = Callable[[Request, RouteContext, RequestHandler], Awaitable[Response]]


# ============================================================================
# Route Definition
# ============================================================================


class AuthRouteMeta(BaseModel):
    """Shared auth-related route metadata."""

    mode: Literal["none", "cookie-session", "bearer", "hybrid"]
    csrf: Optional[bool] = None
    scopes: Optional[List[str]] = None

    model_config = ConfigDict(extra="allow")


class OpenApiRouteMeta(BaseModel):
    """Shared OpenAPI route metadata."""

    include: bool = True
    operation_id: Optional[str] = Field(None, alias="operationId")
    summary: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    request_body_schema: Optional[Dict[str, Any]] = Field(None, alias="requestBodySchema")
    response_schemas: Optional[Dict[str, Dict[str, Any]]] = Field(None, alias="responseSchemas")

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class RouteMeta(BaseModel):
    """Typed shared route metadata."""

    auth: Optional[AuthRouteMeta] = None
    openapi: Optional[OpenApiRouteMeta] = None

    model_config = ConfigDict(extra="allow")


class Route(BaseModel):
    """Route definition."""

    method: HttpMethod
    path: str
    handler: Any  # RequestHandler
    middleware: Optional[List[Any]] = None  # List[Middleware]
    meta: Optional[RouteMeta] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ============================================================================
# CORS Configuration
# ============================================================================


class CorsOptions(BaseModel):
    """CORS configuration.

    Adapters should not return ``Access-Control-Allow-Origin: *`` when
    ``credentials`` is ``True``. Browsers reject wildcard origins on
    credentialed requests, so adapters should echo the request's ``Origin``
    header (or another explicit allowed origin) and include
    ``Access-Control-Allow-Credentials: true`` instead.
    """

    origins: Union[List[str], Literal["*"]] = ["*"]
    methods: List[str] = Field(
        default_factory=lambda: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )
    headers: Union[List[str], Literal["*"]] = ["*"]
    credentials: bool = True
    max_age: int = Field(86400, alias="maxAge")
    expose_headers: Optional[List[str]] = Field(None, alias="exposeHeaders")

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Router Configuration
# ============================================================================


class RouterOptions(BaseModel):
    """Router configuration options."""

    routes: List[Route] = Field(default_factory=list)
    middleware: Optional[List[Any]] = None
    base_path: str = Field("", alias="basePath")
    cors: Optional[Union[CorsOptions, Literal[False]]] = None

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


# ============================================================================
# Error Handling
# ============================================================================


class HttpError(Exception):
    """Base HTTP error."""

    def __init__(
        self,
        message: str,
        status: int = 500,
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code or f"HTTP_{status}"
        self.details = details or {}

    def to_response(self) -> Response:
        """Convert error to HTTP response."""
        return Response(
            status=self.status,
            body={
                "error": {
                    "message": self.message,
                    "code": self.code,
                    "details": self.details,
                }
            },
        )


class BadRequestError(HttpError):
    """400 Bad Request."""

    def __init__(self, message: str = "Bad request", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 400, "BAD_REQUEST", details)


class UnauthorizedError(HttpError):
    """401 Unauthorized."""

    def __init__(self, message: str = "Unauthorized", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 401, "UNAUTHORIZED", details)


class ForbiddenError(HttpError):
    """403 Forbidden."""

    def __init__(self, message: str = "Forbidden", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 403, "FORBIDDEN", details)


class NotFoundError(HttpError):
    """404 Not Found."""

    def __init__(self, message: str = "Not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 404, "NOT_FOUND", details)


class MethodNotAllowedError(HttpError):
    """405 Method Not Allowed."""

    def __init__(
        self, message: str = "Method not allowed", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 405, "METHOD_NOT_ALLOWED", details)


class ConflictError(HttpError):
    """409 Conflict."""

    def __init__(self, message: str = "Conflict", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 409, "CONFLICT", details)


class UnprocessableEntityError(HttpError):
    """422 Unprocessable Entity."""

    def __init__(
        self, message: str = "Unprocessable entity", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 422, "UNPROCESSABLE_ENTITY", details)


class TooManyRequestsError(HttpError):
    """429 Too Many Requests."""

    def __init__(
        self, message: str = "Too many requests", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 429, "TOO_MANY_REQUESTS", details)


class InternalServerError(HttpError):
    """500 Internal Server Error."""

    def __init__(
        self, message: str = "Internal server error", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 500, "INTERNAL_SERVER_ERROR", details)


class HttpNotImplementedError(HttpError):
    """501 Not Implemented."""

    def __init__(self, message: str = "Not implemented", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 501, "NOT_IMPLEMENTED", details)


class ServiceUnavailableError(HttpError):
    """503 Service Unavailable."""

    def __init__(
        self, message: str = "Service unavailable", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 503, "SERVICE_UNAVAILABLE", details)


def serialize_set_cookie(cookie: SetCookie) -> str:
    """Serialize a structured cookie definition into a Set-Cookie header value."""

    parts = [f"{cookie.name}={cookie.value}", f"Path={cookie.path}"]
    if cookie.domain:
        parts.append(f"Domain={cookie.domain}")
    if cookie.max_age is not None:
        parts.append(f"Max-Age={int(cookie.max_age)}")
    if cookie.expires is not None:
        expires = _normalize_cookie_expires(cookie.expires)
        parts.append(f"Expires={expires.strftime('%a, %d %b %Y %H:%M:%S GMT')}")
    if cookie.secure:
        parts.append("Secure")
    if cookie.http_only:
        parts.append("HttpOnly")
    parts.append(f"SameSite={cookie.same_site.capitalize()}")
    return "; ".join(parts)


def serialize_response_cookies(response: Response) -> List[str]:
    """Serialize all cookies for a response in deterministic order."""

    return [serialize_set_cookie(cookie) for cookie in response.cookies]


def _normalize_cookie_expires(expires: datetime) -> datetime:
    """Return a UTC datetime suitable for HTTP cookie serialization."""

    if expires.tzinfo is None:
        return expires.replace(tzinfo=timezone.utc)
    return expires.astimezone(timezone.utc)


def get_route_openapi_meta(route: Route) -> Optional[OpenApiRouteMeta]:
    """Return typed OpenAPI metadata from a route for downstream generators."""

    if route.meta is None:
        return None
    return route.meta.openapi
