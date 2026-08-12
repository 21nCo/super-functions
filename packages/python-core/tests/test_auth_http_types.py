from __future__ import annotations

import pytest

from superfunctions.auth import AuthValidationError, validate_auth_session
from superfunctions.http import (
    Response,
    Route,
    SetCookie,
    get_route_openapi_meta,
    serialize_response_cookies,
)
from superfunctions.http.types import HttpMethod


def test_validate_auth_session_accepts_actor_centric_subject() -> None:
    session = validate_auth_session(
        {
            "id": "sess_01",
            "type": "session",
            "subject": {
                "actorId": "user_01",
                "actorType": "user",
                "regionId": "eu-west-1",
            },
            "methods": ["password"],
        }
    )

    assert session.subject.actor_id == "user_01"
    assert session.subject.actor_type == "user"
    assert session.subject.region_id == "eu-west-1"
    assert session.methods == ["password"]


def test_validate_auth_session_rejects_missing_actor_type() -> None:
    with pytest.raises(AuthValidationError) as exc_info:
        validate_auth_session(
            {
                "id": "sess_01",
                "type": "session",
                "subject": {
                    "actorId": "user_01",
                },
            }
        )

    assert exc_info.value.code == "AUTH_VALIDATION_ERROR"


def test_serialize_response_cookies_preserves_order() -> None:
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


def test_route_meta_accepts_auth_and_openapi_payloads() -> None:
    route = Route(
        method=HttpMethod.GET,
        path="/auth/session",
        handler=lambda request, context: Response(status=200, body={}),
        meta={
            "auth": {"mode": "cookie-session", "csrf": True},
            "openapi": {"operationId": "getSession", "summary": "Read session"},
        },
    )

    assert route.meta is not None
    assert route.meta.auth is not None
    assert route.meta.auth.mode == "cookie-session"
    assert route.meta.openapi is not None
    assert route.meta.openapi.operation_id == "getSession"
    extracted_meta = get_route_openapi_meta(route)
    assert extracted_meta is not None
    assert extracted_meta.operation_id == "getSession"
