"""
Flask adapter for superfunctions.http

Example:
    >>> from flask import Flask
    >>> from superfunctions_flask import create_blueprint
    >>> from superfunctions.http import Route, HttpMethod, Response
    >>> 
    >>> app = Flask(__name__)
    >>> 
    >>> async def get_user(request, context):
    ...     return Response(status=200, body={"id": context.params["id"]})
    >>> 
    >>> routes = [
    ...     Route(method=HttpMethod.GET, path="/users/<id>", handler=get_user)
    ... ]
    >>> 
    >>> blueprint = create_blueprint(routes, url_prefix="/api")
    >>> app.register_blueprint(blueprint)
"""

from .adapter import FlaskRequestAdapter, create_blueprint, to_flask_response

__version__ = "0.1.0"
__all__ = ["FlaskRequestAdapter", "create_blueprint", "to_flask_response"]
