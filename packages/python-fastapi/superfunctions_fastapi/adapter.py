"""FastAPI adapter implementation."""

from typing import Any, Callable, Dict, List

from fastapi import APIRouter, Request as FastAPIRequest
from fastapi.responses import JSONResponse, Response as FastAPIResponse
from superfunctions.http import (
    HttpError,
    HttpMethod,
    Request,
    Response,
    Route,
    RouteContext,
)


class FastAPIRequestAdapter:
    """Adapter to convert FastAPI Request to superfunctions.http.Request protocol."""

    def __init__(self, request: FastAPIRequest):
        self._request = request

    @property
    def method(self) -> str:
        """HTTP method."""
        return self._request.method

    @property
    def path(self) -> str:
        """Request path."""
        return self._request.url.path

    @property
    def headers(self) -> Dict[str, str]:
        """Request headers."""
        return dict(self._request.headers)

    @property
    def query_params(self) -> Dict[str, Any]:
        """Query parameters."""
        return dict(self._request.query_params)

    async def json(self) -> Any:
        """Parse JSON body."""
        return await self._request.json()

    async def body(self) -> bytes:
        """Get raw body."""
        return await self._request.body()

    async def text(self) -> str:
        """Get body as text."""
        body = await self._request.body()
        return body.decode("utf-8")


def to_fastapi_response(response: Response) -> FastAPIResponse:
    """
    Convert superfunctions.http.Response to FastAPI Response.
    
    Args:
        response: superfunctions Response object
    
    Returns:
        FastAPI Response object
    """
    if isinstance(response.body, (dict, list)):
        return JSONResponse(
            content=response.body,
            status_code=response.status,
            headers=response.headers,
        )
    elif isinstance(response.body, str):
        return FastAPIResponse(
            content=response.body,
            status_code=response.status,
            headers=response.headers,
            media_type="text/plain",
        )
    elif isinstance(response.body, bytes):
        return FastAPIResponse(
            content=response.body,
            status_code=response.status,
            headers=response.headers,
        )
    else:
        return FastAPIResponse(
            status_code=response.status,
            headers=response.headers,
        )


def create_handler(handler: Callable, path: str):
    """
    Create a FastAPI handler from a superfunctions handler.
    
    Args:
        handler: superfunctions route handler
        path: Route path for extracting path parameters
    
    Returns:
        FastAPI-compatible async handler
    """

    async def fastapi_handler(request: FastAPIRequest):
        try:
            # Create adapted request
            adapted_request = FastAPIRequestAdapter(request)
            
            # Create context
            context = RouteContext(
                params=dict(request.path_params),
                query=dict(request.query_params),
                headers=dict(request.headers),
                url=str(request.url),
                method=request.method,
            )
            
            # Call handler
            response = await handler(adapted_request, context)
            
            # Convert response
            return to_fastapi_response(response)
        
        except HttpError as e:
            # Convert HTTP errors to responses
            return to_fastapi_response(e.to_response())
        
        except Exception as e:
            # Handle unexpected errors
            return JSONResponse(
                content={"error": {"message": str(e), "code": "INTERNAL_ERROR"}},
                status_code=500,
            )

    return fastapi_handler


def create_router(routes: List[Route], prefix: str = "", tags: List[str] = None) -> APIRouter:
    """
    Create a FastAPI router from superfunctions routes.
    
    Args:
        routes: List of superfunctions Route objects
        prefix: URL prefix for all routes
        tags: List of tags for OpenAPI documentation
    
    Returns:
        FastAPI APIRouter instance
    
    Example:
        >>> from superfunctions.http import Route, HttpMethod, Response
        >>> from superfunctions_fastapi import create_router
        >>> 
        >>> async def get_user(request, context):
        ...     user_id = context.params["id"]
        ...     return Response(status=200, body={"id": user_id})
        >>> 
        >>> routes = [
        ...     Route(method=HttpMethod.GET, path="/users/{id}", handler=get_user)
        ... ]
        >>> 
        >>> router = create_router(routes, prefix="/api")
        >>> 
        >>> # Use with FastAPI app
        >>> app.include_router(router)
    """
    router = APIRouter(prefix=prefix, tags=tags or [])
    
    import re
    
    for route in routes:
        # Convert superfunctions path to FastAPI path
        # superfunctions uses :param, FastAPI uses {param}
        fastapi_path = re.sub(r':([^/]+)', r'{\1}', route.path)
        if not fastapi_path.startswith("/"):
            fastapi_path = f"/{fastapi_path}"
        
        # Create handler
        handler = create_handler(route.handler, route.path)
        
        # Register route based on method
        method_lower = route.method.value.lower()
        
        if method_lower == "get":
            router.get(fastapi_path)(handler)
        elif method_lower == "post":
            router.post(fastapi_path)(handler)
        elif method_lower == "put":
            router.put(fastapi_path)(handler)
        elif method_lower == "patch":
            router.patch(fastapi_path)(handler)
        elif method_lower == "delete":
            router.delete(fastapi_path)(handler)
        elif method_lower == "options":
            router.options(fastapi_path)(handler)
        elif method_lower == "head":
            router.head(fastapi_path)(handler)
    
    return router


def to_fastapi_handler(handler: Callable) -> Callable:
    """
    Convert a single superfunctions handler to FastAPI handler.
    
    This is useful for adding handlers directly to FastAPI routes.
    
    Args:
        handler: superfunctions route handler
    
    Returns:
        FastAPI-compatible handler
    
    Example:
        >>> from fastapi import FastAPI
        >>> from superfunctions_fastapi import to_fastapi_handler
        >>> from superfunctions.http import Response
        >>> 
        >>> app = FastAPI()
        >>> 
        >>> async def get_user(request, context):
        ...     return Response(status=200, body={"id": context.params["id"]})
        >>> 
        >>> @app.get("/users/{id}")
        >>> async def route(request: Request, id: str):
        ...     return await to_fastapi_handler(get_user)(request, id=id)
    """

    async def wrapper(request: FastAPIRequest, **kwargs):
        adapted_request = FastAPIRequestAdapter(request)
        context = RouteContext(
            params=kwargs,
            query=dict(request.query_params),
            headers=dict(request.headers),
            url=str(request.url),
            method=request.method,
        )
        
        try:
            response = await handler(adapted_request, context)
            return to_fastapi_response(response)
        except HttpError as e:
            return to_fastapi_response(e.to_response())

    return wrapper
