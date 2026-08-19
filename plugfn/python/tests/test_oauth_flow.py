"""Focused OAuth token response validation tests."""

import httpx
import pytest

from plugfn.auth.oauth_flow import _response_object


def token_response(payload: object) -> httpx.Response:
    return httpx.Response(
        200,
        json=payload,
        request=httpx.Request("POST", "https://provider.example.test/token"),
    )


def test_rejects_oauth_error_envelope_with_http_200() -> None:
    with pytest.raises(ValueError, match="OAuth token response error: code expired"):
        _response_object(
            token_response({"error": "invalid_grant", "error_description": "code expired"})
        )


def test_rejects_success_envelope_without_access_token() -> None:
    with pytest.raises(ValueError, match="missing access_token"):
        _response_object(token_response({"token_type": "bearer"}))
