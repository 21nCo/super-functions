from __future__ import annotations

from datetime import datetime
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

from authfn import AuthFnConfig, authfn_email_otp_plugin, authfn_password_plugin, create_authfn
from authfn.plugins.email_otp import EmailOtpPluginConfig

from .support import InMemoryDatabaseAdapter, TestRequest, build_context


class DeliveryRecorder:
    def __init__(self) -> None:
        self.sent = []

    async def send(self, payload):
        self.sent.append(payload)
        return {"sent": True, "metadata": {"provider": "test"}} 


def _route(auth, method: str, path: str):
    for route in auth.get_routes():
        if route.method.value == method and route.path == path:
            return route
    raise AssertionError(f"route not found: {method} {path}")


@pytest.mark.asyncio
async def test_password_sign_in_rejects_wrong_credentials_with_canonical_error() -> None:
    auth = create_authfn(
        AuthFnConfig(
            database=InMemoryDatabaseAdapter(),
            namespace="authfn",
            plugins=[authfn_password_plugin()],
        )
    )
    sign_up = _route(auth, "POST", "/auth/sign-up/password")
    sign_in = _route(auth, "POST", "/auth/sign-in/password")

    await sign_up.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-up/password",
            body={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
        ),
        build_context("https://account.example.com/auth/sign-up/password", "POST"),
    )
    rejected = await sign_in.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-in/password",
            body={"email": "ada@example.com", "password": "wrong-password"},
        ),
        build_context("https://account.example.com/auth/sign-in/password", "POST"),
    )

    assert rejected.status == 401
    assert rejected.cookies == []
    assert rejected.body["ok"] is False
    assert rejected.body["error"]["code"] == "AUTHFN_INVALID_CREDENTIALS"
    assert rejected.body["error"]["message"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_password_reset_flow_updates_stored_hash_and_allows_new_sign_in() -> None:
    delivery = DeliveryRecorder()
    auth = create_authfn(
        AuthFnConfig(
            database=InMemoryDatabaseAdapter(),
            namespace="authfn",
            plugins=[
                authfn_password_plugin(),
                authfn_email_otp_plugin(
                    EmailOtpPluginConfig(
                        delivery=delivery,
                        code_generator=lambda: "945183",
                        now=lambda: datetime(2026, 3, 22, 0, 0, 0),
                    )
                ),
            ],
        )
    )
    sign_up = _route(auth, "POST", "/auth/sign-up/password")
    reset_start = _route(auth, "POST", "/auth/password/reset/start")
    reset_complete = _route(auth, "POST", "/auth/password/reset/complete")
    sign_in = _route(auth, "POST", "/auth/sign-in/password")

    await sign_up.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-up/password",
            body={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
        ),
        build_context("https://account.example.com/auth/sign-up/password", "POST"),
    )
    started = await reset_start.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/password/reset/start",
            body={"email": "ada@example.com"},
        ),
        build_context("https://account.example.com/auth/password/reset/start", "POST"),
    )
    assert started.status == 200
    assert started.body["data"]["sent"] is True
    assert delivery.sent[-1]["code"] == "945183"

    completed = await reset_complete.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/password/reset/complete",
            body={
                "email": "ada@example.com",
                "code": "945183",
                "newPassword": "An0therSecurePassphrase!",
            },
        ),
        build_context("https://account.example.com/auth/password/reset/complete", "POST"),
    )
    assert completed.status == 200
    assert completed.body["data"] == {"passwordUpdated": True}

    signed_in = await sign_in.handler(
        TestRequest(
            "POST",
            "https://account.example.com/auth/sign-in/password",
            body={"email": "ada@example.com", "password": "An0therSecurePassphrase!"},
        ),
        build_context("https://account.example.com/auth/sign-in/password", "POST"),
    )
    assert signed_in.status == 200
    assert signed_in.body["ok"] is True
    assert signed_in.body["data"]["session"]["methods"] == ["password"]
