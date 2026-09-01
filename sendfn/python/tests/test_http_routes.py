"""HTTP route envelope tests for sendfn phase 4."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import pytest
from superfunctions.http import RouteContext

from sendfn import Sendfn, SendfnConfig
from sendfn.database.memory import MemoryAdapter
from sendfn.email.service import EmailService
from sendfn.email.templates import TemplateEngine, TemplateRegistry
from sendfn.errors import SendfnError
from sendfn.events.tracker import EventTracker
from sendfn.http.routes import create_sendfn_routes
from sendfn.models import EmailConfig
from sendfn.suppression.manager import SuppressionManager


class FakeRequest:
    """Simple request stub for route handler tests."""

    def __init__(
        self,
        *,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        json_body: Any = None,
        query_params: dict[str, Any] | None = None,
    ) -> None:
        self._method = method
        self._path = path
        self._headers = headers or {}
        self._json_body = json_body
        self._query_params = query_params or {}

    @property
    def method(self) -> str:
        return self._method

    @property
    def path(self) -> str:
        return self._path

    @property
    def headers(self) -> dict[str, str]:
        return self._headers

    @property
    def query_params(self) -> dict[str, Any]:
        return self._query_params

    async def json(self) -> Any:
        return self._json_body

    async def body(self) -> bytes:
        return json.dumps(self._json_body).encode("utf-8")

    async def text(self) -> str:
        return json.dumps(self._json_body)


class FakeVerifier:
    """Async verifier stub for webhook route tests."""

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def verify(self, _message: dict[str, Any]) -> None:
        if self.error is not None:
            raise self.error


class FakeEmailProvider:
    """Minimal provider stub for admin route success coverage."""

    name = "fake-email"

    def __init__(self) -> None:
        self.capabilities = type(
            "Capabilities",
            (),
            {
                "supports_templates": True,
                "supports_attachments": True,
                "supports_bulk_send": False,
                "supports_scheduling": False,
                "max_recipients_per_email": 50,
                "max_attachment_size": 10 * 1024 * 1024,
            },
        )()

    async def initialize(self) -> None:
        return None

    async def send_email(self, _request: Any) -> Any:
        return type(
            "SendEmailResponse",
            (),
            {
                "success": True,
                "provider_message_id": "ses-admin-1",
                "timestamp": datetime(2026, 4, 5, 0, 0, 0),
                "error": None,
            },
        )()

    async def send_bulk_email(self, _requests: list[Any]) -> list[Any]:
        return []

    def validate_email(self, _email: str) -> bool:
        return True

    async def is_healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


def create_envelope(message: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    envelope = {
        "Type": "Notification",
        "MessageId": "sns-1",
        "TopicArn": "arn:aws:sns:us-east-1:123456789012:sendfn",
        "Timestamp": "2026-04-02T00:00:00Z",
        "SignatureVersion": "1",
        "Signature": "valid",
        "SigningCertURL": "https://sns.us-east-1.amazonaws.com/cert.pem",
        "Message": json.dumps(message),
    }
    envelope.update(overrides)
    return envelope


def find_route(sendfn_client: Sendfn, path: str) -> Any:
    routes = create_sendfn_routes(sendfn_client, admin_key="top-secret")
    return next(route for route in routes if route.path == path)


def test_webhook_route_is_absent_without_an_authorized_topic() -> None:
    for topic_arns in (None, ["  "]):
        client = Sendfn(SendfnConfig(database=MemoryAdapter(), aws_sns_topic_arns=topic_arns))
        paths = [route.path for route in create_sendfn_routes(client, admin_key="top-secret")]
        assert "/webhooks/aws-ses" not in paths


def build_context(request: FakeRequest) -> RouteContext:
    return RouteContext(
        params={},
        query=request.query_params,
        headers=request.headers,
        url=f"http://localhost{request.path}",
        method=request.method,
    )


@pytest.mark.asyncio
async def test_webhook_route_returns_canonical_success_and_signature_error_envelopes() -> None:
    client = Sendfn(
        SendfnConfig(
            database=MemoryAdapter(),
            aws_sns_topic_arns=["arn:aws:sns:us-east-1:123456789012:sendfn"],
        )
    )
    client.get_webhook_handlers()["awsSes"].verifier = FakeVerifier()
    route = find_route(client, "/webhooks/aws-ses")

    success_request = FakeRequest(
        method="POST",
        path="/webhooks/aws-ses",
        headers={"x-request-id": "req_route_success"},
        json_body=create_envelope(
            {
                "notificationType": "Delivery",
                "mail": {
                    "messageId": "ses-route",
                    "timestamp": "2026-04-02T00:00:00Z",
                    "destination": ["user@example.com"],
                },
                "delivery": {
                    "timestamp": "2026-04-02T00:00:05Z",
                    "recipients": ["user@example.com"],
                },
            }
        ),
    )
    success = await route.handler(success_request, build_context(success_request))

    assert success.status == 200
    assert success.body == {
        "ok": True,
        "data": {
            "accepted": True,
            "verified": True,
            "matchedTransactions": 0,
            "createdSuppressionEntries": 0,
            "orphanEvents": 1,
        },
        "error": None,
        "meta": {
            "requestId": "req_route_success",
            "version": "v0",
        },
    }

    client.get_webhook_handlers()["awsSes"].verifier = FakeVerifier(
        SendfnError(
            "SNS signature verification failed",
            code="SENDFN_WEBHOOK_SIGNATURE_INVALID",
            retryable=False,
        )
    )
    invalid_request = FakeRequest(
        method="POST",
        path="/webhooks/aws-ses",
        headers={"x-request-id": "req_route_invalid"},
        json_body=create_envelope(
            {
                "notificationType": "Delivery",
                "mail": {
                    "messageId": "ses-route-invalid",
                    "timestamp": "2026-04-02T00:00:00Z",
                },
                "delivery": {
                    "timestamp": "2026-04-02T00:00:05Z",
                    "recipients": ["user@example.com"],
                },
            },
            Signature="invalid",
        ),
    )
    invalid = await route.handler(invalid_request, build_context(invalid_request))

    assert invalid.status == 400
    assert invalid.body == {
        "ok": False,
        "data": None,
        "error": {
            "code": "SENDFN_WEBHOOK_SIGNATURE_INVALID",
            "message": "SNS signature verification failed",
            "retryable": False,
        },
        "meta": {
            "requestId": "req_route_invalid",
            "version": "v0",
        },
    }


@pytest.mark.asyncio
async def test_admin_route_returns_canonical_unauthorized_envelope() -> None:
    client = Sendfn(SendfnConfig(database=MemoryAdapter()))
    route = find_route(client, "/email")

    request = FakeRequest(
        method="POST",
        path="/email",
        headers={"x-request-id": "req_admin_unauthorized"},
        json_body={
            "userId": "user-1",
            "to": "user@example.com",
            "subject": "Hello",
            "html": "<p>Hello</p>",
        },
    )
    response = await route.handler(request, build_context(request))

    assert response.status == 401
    assert response.body == {
        "ok": False,
        "data": None,
        "error": {
            "code": "SENDFN_UNAUTHORIZED",
            "message": "Unauthorized",
            "retryable": False,
        },
        "meta": {
            "requestId": "req_admin_unauthorized",
            "version": "v0",
        },
    }


@pytest.mark.asyncio
async def test_admin_route_returns_canonical_success_envelope_when_authorized() -> None:
    database = MemoryAdapter()
    client = Sendfn(SendfnConfig(database=database))
    client.email_service = EmailService(
        provider=FakeEmailProvider(),
        db=database,
        template_engine=TemplateEngine(),
        template_registry=TemplateRegistry(),
        suppression_manager=SuppressionManager(database),
        event_tracker=EventTracker(database),
        config=EmailConfig(fromEmail="noreply@example.com"),
        retry_attempts=3,
        retry_delay=0,
    )
    route = find_route(client, "/email")

    request = FakeRequest(
        method="POST",
        path="/email",
        headers={
            "authorization": "Bearer top-secret",
            "x-request-id": "req_admin_success",
        },
        json_body={
            "userId": "user-1",
            "to": "user@example.com",
            "subject": "Hello",
            "html": "<p>Hello</p>",
        },
    )
    response = await route.handler(request, build_context(request))

    assert response.status == 201
    assert response.body["ok"] is True
    assert response.body["error"] is None
    assert response.body["data"]["status"] == "sent"
    assert response.body["data"]["provider_message_id"] == "ses-admin-1"
    assert response.body["meta"] == {
        "requestId": "req_admin_success",
        "version": "v0",
    }


@pytest.mark.asyncio
async def test_admin_route_returns_validation_error_envelope_for_bad_request_body() -> None:
    client = Sendfn(SendfnConfig(database=MemoryAdapter()))
    route = find_route(client, "/email")

    request = FakeRequest(
        method="POST",
        path="/email",
        headers={
            "authorization": "Bearer top-secret",
            "x-request-id": "req_admin_invalid",
        },
        json_body={
            "userId": "user-1",
            "subject": "Hello",
            "html": "<p>Hello</p>",
        },
    )
    response = await route.handler(request, build_context(request))

    assert response.status == 400
    assert response.body["ok"] is False
    assert response.body["error"]["code"] == "SENDFN_VALIDATION_ERROR"
    assert response.body["error"]["message"] == "Request body failed validation"
    assert response.body["error"]["retryable"] is False
    assert response.body["meta"] == {
        "requestId": "req_admin_invalid",
        "version": "v0",
    }


@pytest.mark.asyncio
async def test_suppression_route_validates_before_persistence() -> None:
    client = Sendfn(SendfnConfig(database=MemoryAdapter()))
    route = find_route(client, "/suppression")

    for index, body in enumerate(([], {"reason": "manual"}, {"email": "invalid", "reason": "unknown"})):
        request = FakeRequest(
            method="POST",
            path="/suppression",
            headers={
                "authorization": "Bearer top-secret",
                "x-request-id": f"req_suppression_invalid_{index}",
            },
            json_body=body,
        )
        response = await route.handler(request, build_context(request))
        assert response.status == 400
        assert response.body["error"]["code"] == "SENDFN_VALIDATION_ERROR"

    assert await client.export_suppression_list() == []
