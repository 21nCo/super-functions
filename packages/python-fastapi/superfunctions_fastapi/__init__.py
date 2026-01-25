"""
FastAPI adapter for superfunctions.http

Example:
    >>> from fastapi import FastAPI
    >>> from superfunctions_fastapi import create_router
    >>> from superfunctions.http import Response
    >>> 
    >>> app = FastAPI()
    >>> 
    >>> async def get_user(request, context):
    ...     return Response(status=200, body={"id": context.params["id"]})
    >>> 
    >>> router = create_router([
    ...     Route(method=HttpMethod.GET, path="/users/{id}", handler=get_user)
    ... ])
    >>> app.include_router(router)
"""

from .adapter import FastAPIRequestAdapter, create_router, to_fastapi_response

__version__ = "0.1.0"
__all__ = ["FastAPIRequestAdapter", "create_router", "to_fastapi_response"]
