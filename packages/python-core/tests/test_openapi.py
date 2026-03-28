from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from superfunctions.http import (
    HttpMethod,
    HttpNotImplementedError,
    OpenApiGenerationError,
    Response,
    Route,
    SetCookie,
    generate_openapi_document,
    serialize_set_cookie,
    serialize_response_cookies,
)


def test_generate_openapi_document_is_deterministic() -> None:
    routes = [
        Route(
            method=HttpMethod.POST,
            path="/auth/session",
            handler=lambda request, context: Response(status=201, body={}),
            meta={
                "openapi": {
                    "operationId": "createSession",
                    "summary": "Create session",
                    "tags": ["session", "auth"],
                    "requestBodySchema": {
                        "type": "object",
                        "required": ["email"],
                        "properties": {
                            "password": {"type": "string"},
                            "email": {"type": "string"},
                        },
                    },
                    "responseSchemas": {
                        "201": {
                            "type": "object",
                            "properties": {
                                "sessionId": {"type": "string"},
                                "userId": {"type": "string"},
                            },
                        }
                    },
                }
            },
        ),
        Route(
            method=HttpMethod.GET,
            path="/users/:user_id",
            handler=lambda request, context: Response(status=200, body={}),
            meta={
                "openapi": {
                    "operationId": "getUser",
                    "tags": ["users", "auth"],
                }
            },
        ),
    ]

    document = generate_openapi_document("Auth API", "1.0.0", routes)

    assert document == {
        "openapi": "3.1.0",
        "info": {"title": "Auth API", "version": "1.0.0"},
        "paths": {
            "/auth/session": {
                "post": {
                    "operationId": "createSession",
                    "summary": "Create session",
                    "tags": ["auth", "session"],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "properties": {
                                        "email": {"type": "string"},
                                        "password": {"type": "string"},
                                    },
                                    "required": ["email"],
                                    "type": "object",
                                }
                            }
                        },
                    },
                    "responses": {
                        "201": {
                            "description": "HTTP 201 response",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "properties": {
                                            "sessionId": {"type": "string"},
                                            "userId": {"type": "string"},
                                        },
                                        "type": "object",
                                    }
                                }
                            },
                        }
                    },
                }
            },
            "/users/{user_id}": {
                "get": {
                    "operationId": "getUser",
                    "tags": ["auth", "users"],
                    "responses": {
                        "200": {
                            "description": "Success",
                        }
                    },
                }
            },
        },
    }


def test_generate_openapi_document_fails_for_missing_operation_id() -> None:
    routes = [
        Route(
            method=HttpMethod.GET,
            path="/auth/session",
            handler=lambda request, context: Response(status=200, body={}),
            meta={
                "openapi": {
                    "include": True,
                    "summary": "Read session",
                }
            },
        )
    ]

    with pytest.raises(OpenApiGenerationError) as exc_info:
        generate_openapi_document("Broken API", "1.0.0", routes)

    assert exc_info.value.code == "OPENAPI_META_INCOMPLETE"
    assert exc_info.value.details == {"method": "GET", "path": "/auth/session"}


def test_generate_openapi_document_skips_excluded_routes() -> None:
    routes = [
        Route(
            method=HttpMethod.GET,
            path="/internal/health",
            handler=lambda request, context: Response(status=200, body={}),
            meta={"openapi": {"include": False}},
        ),
        Route(
            method=HttpMethod.GET,
            path="/public/health",
            handler=lambda request, context: Response(status=200, body={}),
            meta={"openapi": {"operationId": "healthcheck"}},
        ),
    ]

    document = generate_openapi_document("Health API", "1.0.0", routes)

    assert document["paths"] == {
        "/public/health": {
            "get": {
                "operationId": "healthcheck",
                "responses": {"200": {"description": "Success"}},
            }
        }
    }


def test_generate_openapi_document_fails_for_duplicate_normalized_operations() -> None:
    routes = [
        Route(
            method=HttpMethod.GET,
            path="/users/:user_id",
            handler=lambda request, context: Response(status=200, body={}),
            meta={"openapi": {"operationId": "getUserByColonPath"}},
        ),
        Route(
            method=HttpMethod.GET,
            path="/users/{user_id}",
            handler=lambda request, context: Response(status=200, body={}),
            meta={"openapi": {"operationId": "getUserByBracePath"}},
        ),
    ]

    with pytest.raises(OpenApiGenerationError) as exc_info:
        generate_openapi_document("Users API", "1.0.0", routes)

    assert exc_info.value.code == "OPENAPI_ROUTE_COLLISION"
    assert exc_info.value.details == {
        "method": "GET",
        "path": "/users/{user_id}",
        "firstRoutePath": "/users/:user_id",
        "duplicateRoutePath": "/users/{user_id}",
    }


def test_generate_openapi_document_defaults_empty_response_schemas_to_success() -> None:
    routes = [
        Route(
            method=HttpMethod.GET,
            path="/users",
            handler=lambda request, context: Response(status=200, body=[]),
            meta={"openapi": {"operationId": "listUsers", "responseSchemas": {}}},
        )
    ]

    document = generate_openapi_document("Users API", "1.0.0", routes)

    assert document["paths"]["/users"]["get"]["responses"] == {
        "200": {"description": "Success"}
    }


def test_python_http_preserves_repeated_cookies_for_openapi_phase() -> None:
    response = Response(
        cookies=[
            SetCookie(name="__Secure-authfn.session", value="opaque_1"),
            SetCookie(name="authfn.csrf", value="csrf_1", httpOnly=False),
        ]
    )

    assert serialize_response_cookies(response) == [
        "__Secure-authfn.session=opaque_1; Path=/; Secure; HttpOnly; SameSite=Lax",
        "authfn.csrf=csrf_1; Path=/; Secure; SameSite=Lax",
    ]


def test_set_cookie_validation_rejects_invalid_same_site() -> None:
    with pytest.raises(ValidationError):
        SetCookie(name="authfn.session", value="opaque", sameSite="invalid")


def test_http_not_implemented_error_uses_http_specific_name() -> None:
    error = HttpNotImplementedError()

    assert error.status == 501
    assert error.code == "NOT_IMPLEMENTED"


def test_serialize_set_cookie_normalizes_expires_to_utc() -> None:
    cookie = SetCookie(
        name="session",
        value="opaque",
        expires=datetime(2026, 3, 28, 12, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))),
    )

    assert serialize_set_cookie(cookie) == (
        "session=opaque; Path=/; Expires=Sat, 28 Mar 2026 07:00:00 GMT; "
        "Secure; HttpOnly; SameSite=Lax"
    )
