"""Raw-body webhook verification tests for PlugFn Python."""

import hashlib
import hmac
import time

import pytest

from plugfn.core.provider_registry import ProviderRegistry
from plugfn.providers import github_provider, linear_provider, slack_provider
from plugfn.utils.logger import ConsoleLogger
from plugfn.webhooks.webhook_handler import WebhookHandler


def create_handler() -> WebhookHandler:
    registry = ProviderRegistry(ConsoleLogger("[PlugFn]"))
    registry.register_provider(github_provider)
    registry.register_provider(linear_provider)
    registry.register_provider(slack_provider)
    return WebhookHandler(registry, ConsoleLogger("[PlugFn]"))


@pytest.mark.asyncio
async def test_github_webhook_verifies_raw_bytes_and_dispatches_payload():
    handler = create_handler()
    received = []
    raw_body = b'{"action":"opened","issue":{"id":1}}'
    secret = "github-secret"

    async def on_issue(payload):
        received.append(payload)
        return {"handled": True}

    handler.register_handler("github", "issues.opened", on_issue)

    result = await handler.handle_webhook(
        provider="github",
        event="issues.opened",
        payload=None,
        headers={"x-hub-signature-256": sign_github(raw_body, secret)},
        secret=secret,
        raw_body=raw_body,
    )

    assert result == [{"handled": True}]
    assert received == [{"action": "opened", "issue": {"id": 1}}]


@pytest.mark.asyncio
async def test_slack_webhook_verifies_raw_bytes():
    handler = create_handler()
    raw_body = b'{"type":"event_callback","event":{"type":"app_mention"}}'
    secret = "slack-secret"
    timestamp = str(int(time.time()))

    async def on_mention(payload):
        return {"event_type": payload["event"]["type"]}

    handler.register_handler("slack", "app_mention", on_mention)

    result = await handler.handle_webhook(
        provider="slack",
        event="app_mention",
        payload=None,
        headers={
            "x-slack-request-timestamp": timestamp,
            "x-slack-signature": sign_slack(raw_body, secret, timestamp),
        },
        secret=secret,
        raw_body=raw_body,
    )

    assert result == [{"event_type": "app_mention"}]


@pytest.mark.asyncio
async def test_linear_webhook_verifies_raw_bytes():
    handler = create_handler()
    raw_body = b'{"action":"create","data":{"id":"issue_1"}}'
    secret = "linear-secret"

    async def on_issue(payload):
        return {"issue_id": payload["data"]["id"]}

    handler.register_handler("linear", "issue.created", on_issue)
    result = await handler.handle_webhook(
        provider="linear",
        event="issue.created",
        payload=None,
        headers={"x-signature": sign_linear(raw_body, secret)},
        secret=secret,
        raw_body=raw_body,
    )

    assert result == [{"issue_id": "issue_1"}]


@pytest.mark.asyncio
async def test_github_webhook_rejects_when_raw_bytes_do_not_match_signature():
    handler = create_handler()
    original_raw_body = b'{"action":"opened","issue":{"id":1}}'
    altered_raw_body = b'{"issue":{"id":1},"action":"opened"}'
    secret = "github-secret"

    with pytest.raises(Exception) as error:
        await handler.handle_webhook(
            provider="github",
            event="issues.opened",
            payload=None,
            headers={"x-hub-signature-256": sign_github(original_raw_body, secret)},
            secret=secret,
            raw_body=altered_raw_body,
        )

    assert getattr(error.value, "code", None) == "WEBHOOK_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_signed_provider_fails_closed_when_secret_is_missing():
    handler = create_handler()

    with pytest.raises(Exception) as error:
        await handler.handle_webhook(
            provider="github",
            event="issues.opened",
            payload=None,
            headers={"x-hub-signature-256": "sha256=missing"},
            secret=None,
            raw_body=b'{"action":"opened"}',
        )

    assert getattr(error.value, "code", None) == "WEBHOOK_SECRET_NOT_FOUND"


@pytest.mark.asyncio
async def test_signed_provider_fails_closed_when_raw_body_is_missing():
    handler = create_handler()

    with pytest.raises(Exception) as error:
        await handler.handle_webhook(
            provider="github",
            event="issues.opened",
            payload={"action": "opened"},
            headers={"x-hub-signature-256": "sha256=missing"},
            secret="github-secret",
            raw_body=None,
        )

    assert getattr(error.value, "code", None) == "WEBHOOK_RAW_BODY_REQUIRED"


def sign_github(raw_body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def sign_slack(raw_body: bytes, secret: str, timestamp: str) -> str:
    payload = f"v0:{timestamp}:".encode("utf-8") + raw_body
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"v0={digest}"


def sign_linear(raw_body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
