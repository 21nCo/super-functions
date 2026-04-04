from __future__ import annotations

import os
import sys

import pytest

TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from authfn import AuthFnConfig, authfn_password_plugin, create_authfn

from .support import InMemoryDatabaseAdapter, TestRequest, build_context


def _route(auth, method: str, path: str):
    for route in auth.get_routes():
        if route.method.value == method and route.path == path:
            return route
    raise AssertionError(f"route not found: {method} {path}")


def _cookie_header(response) -> str:
    return "; ".join(f"{cookie.name}={cookie.value}" for cookie in response.cookies)


def _csrf_value(response) -> str:
    for cookie in response.cookies:
        if cookie.name.endswith(".csrf"):
            return cookie.value
    raise AssertionError("csrf cookie not found")


@pytest.mark.asyncio
async def test_cookie_session_routes_issue_list_revoke_and_clear() -> None:
    auth = create_authfn(
        AuthFnConfig(
            database=InMemoryDatabaseAdapter(),
            namespace="authfn",
            plugins=[authfn_password_plugin()],
        )
    )
    sign_up = _route(auth, "POST", "/auth/sign-up/password")
    sign_in = _route(auth, "POST", "/auth/sign-in/password")
    get_session = _route(auth, "GET", "/auth/session")
    list_sessions = _route(auth, "GET", "/auth/sessions")
    revoke_session = _route(auth, "POST", "/auth/sessions/:sessionId/revoke")
    sign_out = _route(auth, "POST", "/auth/sign-out")

    created = await sign_up.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-up/password",
            body={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
        ),
        build_context("https://account.example.com/auth/sign-up/password", "POST"),
    )
    assert created.status == 200
    assert created.body["ok"] is True
    assert created.body["data"]["session"]["primaryEmail"] == "ada@example.com"
    assert [cookie.name for cookie in created.cookies] == ["__Secure-authfn.session", "authfn.csrf"]

    active = await get_session.handler(
        TestRequest(
            "GET",
            "https://account.example.com/auth/session",
            headers={"cookie": _cookie_header(created)},
        ),
        build_context("https://account.example.com/auth/session", "GET"),
    )
    assert active.status == 200
    assert active.body["data"]["session"]["type"] == "session"
    assert active.body["data"]["session"]["methods"] == ["password"]

    second = await sign_in.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-in/password",
            body={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
        ),
        build_context("https://account.example.com/auth/sign-in/password", "POST"),
    )
    listed = await list_sessions.handler(
        TestRequest(
            "GET",
            "https://account.example.com/auth/sessions",
            headers={"cookie": _cookie_header(second)},
        ),
        build_context("https://account.example.com/auth/sessions", "GET"),
    )
    assert listed.status == 200
    assert len(listed.body["data"]["sessions"]) == 2
    current_session_id = listed.body["data"]["currentSessionId"]
    first_session_id = next(
        session["id"] for session in listed.body["data"]["sessions"] if session["id"] != current_session_id
    )

    revoked = await revoke_session.handler(
        TestRequest(
            "POST",
            f"https://account.example.com/auth/sessions/{first_session_id}/revoke",
            headers={
                "cookie": _cookie_header(second),
                "x-authfn-csrf": _csrf_value(second),
            },
        ),
        build_context(
            f"https://account.example.com/auth/sessions/{first_session_id}/revoke",
            "POST",
            params={"sessionId": first_session_id},
        ),
    )
    assert revoked.status == 200
    assert revoked.body["data"] == {"revoked": True, "sessionId": first_session_id}

    cleared = await get_session.handler(
        TestRequest(
            "GET",
            "https://account.example.com/auth/session",
            headers={"cookie": _cookie_header(created)},
        ),
        build_context("https://account.example.com/auth/session", "GET"),
    )
    assert cleared.status == 200
    assert cleared.body["data"]["session"] is None
    assert [cookie.value for cookie in cleared.cookies] == ["", ""]

    signed_out = await sign_out.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-out",
            body={"allSessions": True},
            headers={
                "cookie": _cookie_header(second),
                "x-authfn-csrf": _csrf_value(second),
            },
        ),
        build_context("https://account.example.com/auth/sign-out", "POST"),
    )
    assert signed_out.status == 200
    assert signed_out.body["data"] == {"revoked": True, "allSessions": True}
