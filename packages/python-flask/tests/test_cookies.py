from __future__ import annotations

import asyncio
import threading

from flask import Flask
import pytest

import superfunctions_flask.adapter as flask_adapter
from superfunctions.http import HttpError, HttpMethod, Response, Route, SetCookie, generate_openapi_document
from superfunctions_flask import create_blueprint, to_flask_handler
from superfunctions_flask.adapter import SUPERFUNCTIONS_ROUTE_ATTR, _run_async_handler


def test_flask_adapter_preserves_repeated_cookies_and_route_metadata() -> None:
    async def create_session(request, context):
        return Response(
            status=200,
            cookies=[
                SetCookie(
                    name="__Secure-authfn.session",
                    value="opaque_123",
                    domain=".example.com",
                    sameSite="none",
                ),
                SetCookie(
                    name="authfn.csrf",
                    value="csrf_123",
                    domain=".example.com",
                    httpOnly=False,
                    sameSite="strict",
                ),
            ],
            body={"ok": True},
        )

    routes = [
        Route(
            method=HttpMethod.POST,
            path="/auth/session",
            handler=create_session,
            meta={
                "auth": {"mode": "cookie-session", "csrf": True},
                "openapi": {
                    "operationId": "createSession",
                    "summary": "Create session",
                    "tags": ["auth", "session"],
                },
            },
        )
    ]
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(routes, url_prefix="/api"))

    client = app.test_client()
    response = client.post("/api/auth/session")

    set_cookie_headers = response.headers.getlist("Set-Cookie")
    assert len(set_cookie_headers) == 2
    cookies_by_name = {
        header.split("=", 1)[0]: header for header in set_cookie_headers
    }
    assert "Domain=example.com" in cookies_by_name["__Secure-authfn.session"]
    assert "SameSite=None" in cookies_by_name["__Secure-authfn.session"]
    assert "HttpOnly" in cookies_by_name["__Secure-authfn.session"]
    assert "Domain=example.com" in cookies_by_name["authfn.csrf"]
    assert "SameSite=Strict" in cookies_by_name["authfn.csrf"]
    assert "HttpOnly" not in cookies_by_name["authfn.csrf"]

    preserved_handler = app.view_functions["superfunctions.post_auth_session"]
    preserved = getattr(preserved_handler, SUPERFUNCTIONS_ROUTE_ATTR)
    assert preserved.meta is not None
    assert preserved.meta.openapi is not None
    assert preserved.meta.openapi.operation_id == "createSession"

    assert generate_openapi_document("Auth API", "1.0.0", [preserved])["paths"] == {
        "/auth/session": {
            "post": {
                "operationId": "createSession",
                "summary": "Create session",
                "tags": ["auth", "session"],
                "responses": {"200": {"description": "Success"}},
            }
        }
    }


def test_to_flask_handler_supports_http_errors_and_non_json_bodies() -> None:
    app = Flask(__name__)

    async def text_handler(request, context):
        return Response(status=201, body="created")

    async def bytes_handler(request, context):
        return Response(status=202, body=b"payload")

    async def error_handler(request, context):
        raise HttpError("Short and stout", status=418, code="TEAPOT")

    text_route = to_flask_handler(text_handler)
    bytes_route = to_flask_handler(bytes_handler)
    error_route = to_flask_handler(error_handler)

    @app.route("/text")
    def text_endpoint():
        return text_route()

    @app.route("/bytes")
    def bytes_endpoint():
        return bytes_route()

    @app.route("/error")
    def error_endpoint():
        return error_route()

    client = app.test_client()

    text_response = client.get("/text")
    assert text_response.status_code == 201
    assert text_response.get_data(as_text=True) == "created"
    assert text_response.headers["Content-Type"].startswith("text/plain")

    bytes_response = client.get("/bytes")
    assert bytes_response.status_code == 202
    assert bytes_response.data == b"payload"

    error_response = client.get("/error")
    assert error_response.status_code == 418
    assert error_response.get_json() == {
        "error": {
            "message": "Short and stout",
            "code": "TEAPOT",
            "details": {},
        }
    }


def test_flask_adapter_internal_errors_are_generic_for_blueprint_and_wrapper() -> None:
    async def crash_handler(request, context):
        raise RuntimeError("secret blueprint failure")

    async def crash_wrapper_handler(request, context):
        raise RuntimeError("secret wrapper failure")

    routes = [
        Route(
            method=HttpMethod.GET,
            path="/crash",
            handler=crash_handler,
        )
    ]
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(routes, url_prefix="/api"))

    wrapped_route = to_flask_handler(crash_wrapper_handler)

    @app.route("/wrapped-crash")
    def wrapped_crash_endpoint():
        return wrapped_route()

    client = app.test_client()

    blueprint_response = client.get("/api/crash")
    assert blueprint_response.status_code == 500
    assert blueprint_response.get_json() == {
        "error": {
            "message": "Internal server error",
            "code": "INTERNAL_ERROR",
        }
    }
    assert "secret blueprint failure" not in blueprint_response.get_data(as_text=True)

    wrapper_response = client.get("/wrapped-crash")
    assert wrapper_response.status_code == 500
    assert wrapper_response.get_json() == {
        "error": {
            "message": "Internal server error",
            "code": "INTERNAL_ERROR",
        }
    }
    assert "secret wrapper failure" not in wrapper_response.get_data(as_text=True)


@pytest.mark.asyncio
async def test_flask_async_bridge_supports_running_event_loop() -> None:
    async def resolve_response() -> Response:
        return Response(status=204)

    response = _run_async_handler(resolve_response)

    assert response.status == 204


@pytest.mark.asyncio
async def test_flask_handler_captures_request_before_thread_fallback() -> None:
    app = Flask(__name__)

    async def echo_request(request, context):
        return Response(
            status=200,
            body={
                "json": await request.json(),
                "header": request.headers["X-Trace-Id"],
                "query": context.query["mode"],
            },
        )

    handler = to_flask_handler(echo_request)

    with app.test_request_context(
        "/echo?mode=threaded",
        method="POST",
        json={"ok": True},
        headers={"X-Trace-Id": "trace-123"},
    ):
        response = handler()

    assert response.status_code == 200
    assert response.get_json() == {
        "json": {"ok": True},
        "header": "trace-123",
        "query": "threaded",
    }


@pytest.mark.asyncio
async def test_flask_async_bridge_times_out_and_cancels_stalled_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancelled = threading.Event()

    async def stalled_response() -> Response:
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(flask_adapter, "DEFAULT_ASYNC_HANDLER_TIMEOUT", 0.001)

    with pytest.raises(TimeoutError, match="timed out"):
        _run_async_handler(stalled_response)

    assert cancelled.wait(timeout=1)
