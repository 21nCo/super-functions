"""Core type definitions for the HTTP abstraction layer."""

from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, Protocol, Union

from pydantic import BaseModel, Field


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


class Response(BaseModel):
    """Generic HTTP response."""

    status: int = 200
    headers: Dict[str, str] = Field(default_factory=dict)
    body: Union[str, bytes, Dict[str, Any], List[Any], None] = None

    class Config:
        arbitrary_types_allowed = True


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

    class Config:
        arbitrary_types_allowed = True


# ============================================================================
# Handlers and Middleware
# ============================================================================

RequestHandler = Callable[[Request, RouteContext], Awaitable[Response]]
Middleware = Callable[[Request, RouteContext, RequestHandler], Awaitable[Response]]


# ============================================================================
# Route Definition
# ============================================================================


class Route(BaseModel):
    """Route definition."""

    method: HttpMethod
    path: str
    handler: Any  # RequestHandler
    middleware: Optional[List[Any]] = None  # List[Middleware]
    meta: Optional[Dict[str, Any]] = None

    class Config:
        arbitrary_types_allowed = True


# ============================================================================
# CORS Configuration
# ============================================================================


class CorsOptions(BaseModel):
    """CORS configuration."""

    origins: Union[List[str], Literal["*"]] = ["*"]
    methods: List[str] = Field(
        default_factory=lambda: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )
    headers: Union[List[str], Literal["*"]] = ["*"]
    credentials: bool = True
    max_age: int = Field(86400, alias="maxAge")
    expose_headers: Optional[List[str]] = Field(None, alias="exposeHeaders")

    class Config:
        populate_by_name = True


# ============================================================================
# Router Configuration
# ============================================================================


class RouterOptions(BaseModel):
    """Router configuration options."""

    routes: List[Route] = Field(default_factory=list)
    middleware: Optional[List[Any]] = None
    base_path: str = Field("", alias="basePath")
    cors: Optional[Union[CorsOptions, Literal[False]]] = None

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True


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


class NotImplementedError(HttpError):
    """501 Not Implemented."""

    def __init__(self, message: str = "Not implemented", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 501, "NOT_IMPLEMENTED", details)


class ServiceUnavailableError(HttpError):
    """503 Service Unavailable."""

    def __init__(
        self, message: str = "Service unavailable", details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, 503, "SERVICE_UNAVAILABLE", details)
