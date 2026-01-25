"""Flask adapter implementation."""

import asyncio
from typing import Any, Callable, Dict, List

from flask import Blueprint, Request as FlaskRequest, Response as FlaskResponse, jsonify, request
from superfunctions.http import (
    HttpError,
    HttpMethod,
    Request,
    Response,
    Route,
    RouteContext,
)


class FlaskRequestAdapter:
    """Adapter to convert Flask Request to superfunctions.http.Request protocol."""

    def __init__(self, request: FlaskRequest):
        self._request = request

    @property
    def method(self) -> str:
        """HTTP method."""
        return self._request.method

    @property
    def path(self) -> str:
        """Request path."""
        return self._request.path

    @property
    def headers(self) -> Dict[str, str]:
        """Request headers."""
        return dict(self._request.headers)

    @property
    def query_params(self) -> Dict[str, Any]:
        """Query parameters."""
        return dict(self._request.args)

    async def json(self) -> Any:
        """Parse JSON body."""
        return self._request.get_json()

    async def body(self) -> bytes:
        """Get raw body."""
        return self._request.get_data()

    async def text(self) -> str:
        """Get body as text."""
        return self._request.get_data(as_text=True)


def to_flask_response(response: Response) -> FlaskResponse:
    """
    Convert superfunctions.http.Response to Flask Response.
    
    Args:
        response: superfunctions Response object
    
    Returns:
        Flask Response object
    """
    if isinstance(response.body, (dict, list)):
        flask_response = jsonify(response.body)
        flask_response.status_code = response.status
    elif isinstance(response.body, str):
        flask_response = FlaskResponse(
            response.body,
            status=response.status,
            mimetype="text/plain",
        )
    elif isinstance(response.body, bytes):
        flask_response = FlaskResponse(
            response.body,
            status=response.status,
        )
    else:
        flask_response = FlaskResponse(status=response.status)
    
    # Add headers
    for key, value in response.headers.items():
        flask_response.headers[key] = value
    
    return flask_response


def create_handler(handler: Callable):
    """
    Create a Flask handler from a superfunctions handler.
    
    Args:
        handler: superfunctions route handler
    
    Returns:
        Flask-compatible handler
    """

    def flask_handler(**path_params):
        try:
            # Create adapted request
            adapted_request = FlaskRequestAdapter(request)
            
            # Create context
            context = RouteContext(
                params=path_params,
                query=dict(request.args),
                headers=dict(request.headers),
                url=request.url,
                method=request.method,
            )
            
            # Call handler (async)
            response = asyncio.run(handler(adapted_request, context))
            
            # Convert response
            return to_flask_response(response)
        
        except HttpError as e:
            # Convert HTTP errors to responses
            return to_flask_response(e.to_response())
        
        except Exception as e:
            # Handle unexpected errors
            return jsonify({"error": {"message": str(e), "code": "INTERNAL_ERROR"}}), 500

    return flask_handler


def create_blueprint(
    routes: List[Route],
    name: str = "superfunctions",
    url_prefix: str = "",
) -> Blueprint:
    """
    Create a Flask Blueprint from superfunctions routes.
    
    Args:
        routes: List of superfunctions Route objects
        name: Blueprint name
        url_prefix: URL prefix for all routes
    
    Returns:
        Flask Blueprint instance
    
    Example:
        >>> from superfunctions.http import Route, HttpMethod, Response
        >>> from superfunctions_flask import create_blueprint
        >>> 
        >>> async def get_user(request, context):
        ...     user_id = context.params["id"]
        ...     return Response(status=200, body={"id": user_id})
        >>> 
        >>> routes = [
        ...     Route(method=HttpMethod.GET, path="/users/<id>", handler=get_user)
        ... ]
        >>> 
        >>> blueprint = create_blueprint(routes, url_prefix="/api")
        >>> 
        >>> # Use with Flask app
        >>> app.register_blueprint(blueprint)
    """
    blueprint = Blueprint(name, __name__, url_prefix=url_prefix)
    
    for route in routes:
        # Convert superfunctions path to Flask path
        # superfunctions uses :param, Flask uses <param>
        flask_path = route.path.replace(":", "<").replace("/<", "/<")
        if "<" in flask_path and ">" not in flask_path:
            # Add closing bracket if missing
            parts = flask_path.split("<")
            flask_parts = []
            for i, part in enumerate(parts):
                if i > 0 and ">" not in part:
                    # Find next slash or end
                    if "/" in part:
                        param_name, rest = part.split("/", 1)
                        flask_parts.append(f"<{param_name}>/{rest}")
                    else:
                        flask_parts.append(f"<{part}>")
                else:
                    flask_parts.append(part)
            flask_path = "".join(flask_parts)
        
        # Create handler
        handler = create_handler(route.handler)
        
        # Register route based on method
        methods = [route.method.value]
        
        blueprint.add_url_rule(
            flask_path,
            endpoint=f"{route.method.value.lower()}_{flask_path.replace('/', '_').replace('<', '').replace('>', '')}",
            view_func=handler,
            methods=methods,
        )
    
    return blueprint


def to_flask_handler(handler: Callable) -> Callable:
    """
    Convert a single superfunctions handler to Flask handler.
    
    This is useful for adding handlers directly to Flask routes.
    
    Args:
        handler: superfunctions route handler
    
    Returns:
        Flask-compatible handler
    
    Example:
        >>> from flask import Flask
        >>> from superfunctions_flask import to_flask_handler
        >>> from superfunctions.http import Response
        >>> 
        >>> app = Flask(__name__)
        >>> 
        >>> async def get_user(request, context):
        ...     return Response(status=200, body={"id": context.params["id"]})
        >>> 
        >>> @app.route("/users/<id>")
        >>> def route(id):
        ...     return to_flask_handler(get_user)(id=id)
    """

    def wrapper(**kwargs):
        adapted_request = FlaskRequestAdapter(request)
        context = RouteContext(
            params=kwargs,
            query=dict(request.args),
            headers=dict(request.headers),
            url=request.url,
            method=request.method,
        )
        
        try:
            response = asyncio.run(handler(adapted_request, context))
            return to_flask_response(response)
        except HttpError as e:
            return to_flask_response(e.to_response())

    return wrapper
