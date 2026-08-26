from __future__ import annotations

from fastapi import FastAPI
from fastapi import Request as FastAPIRequest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from superfunctions.http import (
    HttpError,
    HttpMethod,
    Response,
    Route,
    RouteMeta,
    SetCookie,
    generate_openapi_document,
)

from superfunctions_fastapi import create_router, to_fastapi_handler
from superfunctions_fastapi.adapter import SUPERFUNCTIONS_ROUTE_ATTR


def make_route_meta(**kwargs: object) -> RouteMeta:
    return RouteMeta.model_validate(kwargs)


def test_fastapi_adapter_preserves_repeated_cookies_and_route_metadata() -> None:
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
                    secure=True,
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
            meta=make_route_meta(
                auth={"mode": "cookie-session", "csrf": True},
                openapi={
                    "operationId": "createSession",
                    "summary": "Create session",
                    "tags": ["auth", "session"],
                },
            ),
        )
    ]
    app = FastAPI()
    router = create_router(routes, prefix="/api")
    app.include_router(router)

    client = TestClient(app)
    response = client.post("/api/auth/session")

    set_cookie_headers = response.headers.get_list("set-cookie")
    assert len(set_cookie_headers) == 2
    assert "Domain=.example.com" in set_cookie_headers[0]
    assert "SameSite=none" in set_cookie_headers[0]
    assert "HttpOnly" in set_cookie_headers[0]
    assert "Domain=.example.com" in set_cookie_headers[1]
    assert "SameSite=strict" in set_cookie_headers[1]
    assert "HttpOnly" not in set_cookie_headers[1]

    registered_route = next(
        route
        for route in router.routes
        if isinstance(route, APIRoute)
    )
    preserved = getattr(registered_route.endpoint, SUPERFUNCTIONS_ROUTE_ATTR)
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


def test_to_fastapi_handler_supports_http_errors_and_non_json_bodies() -> None:
    app = FastAPI()

    async def text_handler(request, context):
        return Response(status=201, body="created")

    async def bytes_handler(request, context):
        return Response(status=202, body=b"payload")

    async def error_handler(request, context):
        raise HttpError("Short and stout", status=418, code="TEAPOT")

    text_route = to_fastapi_handler(text_handler)
    bytes_route = to_fastapi_handler(bytes_handler)
    error_route = to_fastapi_handler(error_handler)

    @app.get("/text")
    async def text_endpoint(request: FastAPIRequest):
        return await text_route(request)

    @app.get("/bytes")
    async def bytes_endpoint(request: FastAPIRequest):
        return await bytes_route(request)

    @app.get("/error")
    async def error_endpoint(request: FastAPIRequest):
        return await error_route(request)

    client = TestClient(app)

    text_response = client.get("/text")
    assert text_response.status_code == 201
    assert text_response.text == "created"
    assert text_response.headers["content-type"].startswith("text/plain")

    bytes_response = client.get("/bytes")
    assert bytes_response.status_code == 202
    assert bytes_response.content == b"payload"

    error_response = client.get("/error")
    assert error_response.status_code == 418
    assert error_response.json() == {
        "error": {
            "message": "Short and stout",
            "code": "TEAPOT",
            "details": {},
        }
    }


def test_fastapi_adapter_internal_errors_are_generic_for_router_and_wrapper() -> None:
    app = FastAPI()

    async def crash_handler(request, context):
        raise RuntimeError("secret router failure")

    async def crash_wrapper_handler(request, context):
        raise RuntimeError("secret wrapper failure")

    router = create_router(
        [
            Route(
                method=HttpMethod.GET,
                path="/crash",
                handler=crash_handler,
            )
        ],
        prefix="/api",
    )
    app.include_router(router)

    wrapper_route = to_fastapi_handler(crash_wrapper_handler)

    @app.get("/wrapped-crash")
    async def wrapped_crash_endpoint(request: FastAPIRequest):
        return await wrapper_route(request)

    client = TestClient(app)

    router_response = client.get("/api/crash")
    assert router_response.status_code == 500
    assert router_response.json() == {
        "error": {
            "message": "Internal server error",
            "code": "INTERNAL_ERROR",
        }
    }
    assert "secret router failure" not in router_response.text

    wrapper_response = client.get("/wrapped-crash")
    assert wrapper_response.status_code == 500
    assert wrapper_response.json() == {
        "error": {
            "message": "Internal server error",
            "code": "INTERNAL_ERROR",
        }
    }
    assert "secret wrapper failure" not in wrapper_response.text
