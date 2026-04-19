"""Flask adapter implementation."""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from typing import Any, Awaitable, Callable, Coroutine, Dict, List, cast

from flask import Blueprint, jsonify, request
from flask import Request as FlaskRequest
from flask import Response as FlaskResponse
from superfunctions.http import (
    HttpError,
    Response,
    Route,
    RouteContext,
)

SUPERFUNCTIONS_ROUTE_ATTR = "__superfunctions_route__"
SUPERFUNCTIONS_ROUTE_META_ATTR = "__superfunctions_route_meta__"
DEFAULT_ASYNC_HANDLER_TIMEOUT = 30.0
logger = logging.getLogger(__name__)


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

    for cookie in response.cookies:
        flask_response.set_cookie(
            key=cookie.name,
            value=cookie.value,
            max_age=cookie.max_age,
            expires=cookie.expires,
            path=cookie.path,
            domain=cookie.domain,
            secure=cookie.secure,
            httponly=cookie.http_only,
            samesite=cookie.same_site,
        )

    return flask_response


def _internal_error_response() -> FlaskResponse:
    return to_flask_response(
        Response(
            status=500,
            body={
                "error": {
                    "message": "Internal server error",
                    "code": "INTERNAL_ERROR",
                }
            },
        )
    )


def _run_async_handler(factory: Callable[[], Awaitable[Response]]) -> Response:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(cast(Coroutine[Any, Any, Response], factory()))

    result: dict[str, Response] = {}
    error: dict[str, BaseException] = {}

    def runner() -> None:
        try:
            result["value"] = asyncio.run(
                asyncio.wait_for(factory(), timeout=DEFAULT_ASYNC_HANDLER_TIMEOUT)
            )
        except asyncio.TimeoutError:
            error["value"] = TimeoutError(
                f"Flask adapter async handler timed out after {DEFAULT_ASYNC_HANDLER_TIMEOUT:g}s"
            )
        except BaseException as exc:
            error["value"] = exc

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    thread.join()

    if "value" in error:
        raise error["value"]
    if "value" not in result:
        raise RuntimeError("Flask adapter failed to execute async handler")
    return result["value"]


def _create_request_context(path_params: Dict[str, Any]) -> tuple[FlaskRequestAdapter, RouteContext]:
    current_request = cast(FlaskRequest, cast(Any, request)._get_current_object())
    adapted_request = FlaskRequestAdapter(current_request)
    context = RouteContext(
        params=path_params,
        query=dict(current_request.args),
        headers=dict(current_request.headers),
        url=current_request.url,
        method=current_request.method,
    )
    return adapted_request, context


def _invoke_flask_handler(
    handler: Callable,
    path_params: Dict[str, Any],
    *,
    log_label: str,
) -> FlaskResponse:
    try:
        adapted_request, context = _create_request_context(path_params)
        response = _run_async_handler(lambda: handler(adapted_request, context))
        return to_flask_response(response)
    except HttpError as error:
        return to_flask_response(error.to_response())
    except Exception:
        logger.exception("Unhandled error while processing Flask %s", log_label)
        return _internal_error_response()


def create_handler(handler: Callable, route: Route):
    """
    Create a Flask handler from a superfunctions handler.

    Args:
        handler: superfunctions route handler

    Returns:
        Flask-compatible handler
    """

    def flask_handler(**path_params):
        return _invoke_flask_handler(handler, path_params, log_label="route")

    setattr(flask_handler, SUPERFUNCTIONS_ROUTE_ATTR, route)
    setattr(flask_handler, SUPERFUNCTIONS_ROUTE_META_ATTR, route.meta)
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
        flask_path = re.sub(r":([^/]+)", r"<\1>", route.path)
        if not flask_path.startswith("/"):
            flask_path = f"/{flask_path}"

        # Create handler
        handler = create_handler(route.handler, route)

        # Register route based on method
        methods = [route.method.value]
        endpoint = (
            f"{route.method.value.lower()}_"
            f"{flask_path.strip('/').replace('/', '_').replace('<', '').replace('>', '') or 'root'}"
        )
        blueprint.add_url_rule(
            flask_path,
            endpoint=endpoint,
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
        return _invoke_flask_handler(handler, kwargs, log_label="handler")

    return wrapper
