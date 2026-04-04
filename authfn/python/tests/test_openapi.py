from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
from flask import Flask
import pytest

TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)
PYTHON_FASTAPI_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-fastapi")
)
PYTHON_FLASK_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-flask")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT, PYTHON_FASTAPI_ROOT, PYTHON_FLASK_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from authfn import (
    AuthFnConfig,
    authfn_api_key_plugin,
    authfn_email_otp_plugin,
    authfn_multi_region_plugin,
    authfn_password_plugin,
    authfn_social_oauth_plugin,
    authfn_two_factor_plugin,
    create_authfn,
)
from authfn.errors import InternalError
from authfn.http import create_authfn_openapi
from authfn.plugins.email_otp import EmailOtpPluginConfig
from authfn.plugins.multi_region import MultiRegionPluginConfig, MultiRegionRegionConfig
from authfn.plugins.social_oauth import SocialOAuthPluginConfig, SocialProviderConfig
from superfunctions.http import Response, Route
from superfunctions.http.openapi import OpenApiGenerationError
from superfunctions.http.types import HttpMethod
from superfunctions_fastapi.adapter import create_router
from superfunctions_flask.adapter import create_blueprint

from .support import InMemoryDatabaseAdapter


class DeliveryStub:
    async def send(self, payload):
        return {"sent": True, "metadata": {"channel": payload["channel"]}}


def _build_auth(*, secure: bool = True):
    return create_authfn(
        AuthFnConfig(
            database=InMemoryDatabaseAdapter(),
            namespace="authfn",
            cookie={"secure": secure},
            plugins=[
                authfn_password_plugin(),
                authfn_email_otp_plugin(EmailOtpPluginConfig(delivery=DeliveryStub())),
                authfn_social_oauth_plugin(
                    SocialOAuthPluginConfig(
                        providers={
                            "google": SocialProviderConfig(
                                client_id="google-client-id",
                                client_secret="google-client-secret",
                                allowlisted_return_to=["https://app.example.com/post-auth"],
                            ),
                            "apple": SocialProviderConfig(
                                client_id="apple-client-id",
                                client_secret="apple-client-secret",
                                allowlisted_return_to=["https://app.example.com/apple-post-auth"],
                            ),
                            "github": SocialProviderConfig(
                                client_id="github-client-id",
                                client_secret="github-client-secret",
                            ),
                        }
                    )
                ),
                authfn_api_key_plugin(),
                authfn_two_factor_plugin(),
                authfn_multi_region_plugin(
                    MultiRegionPluginConfig(
                            regions=[
                                MultiRegionRegionConfig(
                                    region_id="us-east-1",
                                    authority="https://account.example.com",
                                )
                            ]
                    )
                ),
            ],
        )
    )


def test_authfn_openapi_and_route_inventory_match_expected_surface() -> None:
    auth = _build_auth()
    paths = {(route.method.value, route.path) for route in auth.get_routes()}

    assert paths == {
        ("GET", "/auth/session"),
        ("GET", "/auth/sessions"),
        ("POST", "/auth/sign-out"),
        ("POST", "/auth/sessions/:sessionId/revoke"),
        ("POST", "/auth/sign-up/password"),
        ("POST", "/auth/password/reset/start"),
        ("POST", "/auth/password/reset/complete"),
        ("POST", "/auth/sign-in/password"),
        ("POST", "/auth/otp/send"),
        ("POST", "/auth/otp/verify"),
        ("POST", "/auth/social/start"),
        ("GET", "/auth/social/callback/:provider"),
        ("POST", "/auth/social/disconnect/:provider"),
        ("POST", "/auth/api-keys"),
        ("GET", "/auth/api-keys"),
        ("DELETE", "/auth/api-keys/:keyId"),
        ("POST", "/auth/2fa/enroll"),
        ("POST", "/auth/2fa/confirm"),
        ("POST", "/auth/2fa/challenge"),
        ("POST", "/auth/2fa/disable"),
        ("POST", "/auth/regions/lookup"),
        ("GET", "/auth/runtime"),
    }

    document = create_authfn_openapi(auth.config)
    assert document["paths"]["/auth/social/callback/{provider}"]["get"]["operationId"] == "completeSocialSignIn"
    assert document["paths"]["/auth/sign-up/password"]["post"]["operationId"] == "signUpWithPassword"
    assert document["paths"]["/auth/runtime"]["get"]["operationId"] == "getRuntime"


def test_authfn_openapi_wraps_missing_route_metadata_as_internal_error(monkeypatch) -> None:
    def broken_routes(_config):
        return [
            Route(
                method=HttpMethod.GET,
                path="/auth/session",
                handler=lambda request, context: Response(status=200, body={}),
                meta={"openapi": {"include": True}},
            )
        ]

    monkeypatch.setattr("authfn.http.create_authfn_routes", broken_routes)

    with pytest.raises(InternalError) as exc_info:
        create_authfn_openapi(AuthFnConfig(database=InMemoryDatabaseAdapter(), namespace="authfn"))

    assert exc_info.value.code == "AUTHFN_INTERNAL_ERROR"
    assert exc_info.value.details["code"] == "OPENAPI_META_INCOMPLETE"


def test_fastapi_smoke_app_preserves_authfn_cookies_and_session_headers() -> None:
    auth = _build_auth(secure=False)
    app = FastAPI()
    app.include_router(create_router(auth.get_routes(), prefix="/api"))

    client = TestClient(app)
    created = client.post(
        "/api/auth/sign-up/password",
        json={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
    )
    assert created.status_code == 200
    assert len(created.headers.get_list("set-cookie")) == 2
    assert created.json()["ok"] is True

    current = client.get("/api/auth/session")
    assert current.status_code == 200
    assert current.headers["x-request-id"].startswith("req_")
    assert current.json()["data"]["session"]["primaryEmail"] == "ada@example.com"


def test_flask_smoke_app_preserves_authfn_cookies_and_session_headers() -> None:
    auth = _build_auth(secure=False)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(auth.get_routes(), url_prefix="/api"))

    client = app.test_client()
    created = client.post(
        "/api/auth/sign-up/password",
        json={"email": "ada@example.com", "password": "Sup3rSecurePassphrase!"},
    )
    assert created.status_code == 200
    assert len(created.headers.getlist("Set-Cookie")) == 2
    assert created.json["ok"] is True

    current = client.get("/api/auth/session")
    assert current.status_code == 200
    assert current.headers["x-request-id"].startswith("req_")
    assert current.json["data"]["session"]["primaryEmail"] == "ada@example.com"
