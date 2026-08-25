"""Observability tests for authfn Python."""

from __future__ import annotations

from types import SimpleNamespace
from typing import List

import pytest

from authfn.observability import emit_auth_event
from authfn.types import AuthFnEvent


@pytest.mark.asyncio
async def test_error_code_metadata_is_preserved_while_secrets_are_redacted() -> None:
    captured: List[AuthFnEvent] = []

    await emit_auth_event(
        SimpleNamespace(observability={"emit": captured.append}),
        {
            "type": "authfn.plugin.failed",
            "requestId": "req_observability",
            "metadata": {
                "errorCode": "AUTHFN_PLUGIN_ABORTED",
                "authorizationCode": "provider-code",
                "accessToken": "provider-token",
            },
        },
    )

    assert len(captured) == 1
    assert captured[0].metadata == {
        "errorCode": "AUTHFN_PLUGIN_ABORTED",
        "authorizationCode": "[redacted]",
        "accessToken": "[redacted]",
    }
