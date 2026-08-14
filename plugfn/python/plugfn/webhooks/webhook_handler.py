"""Webhook handler for processing provider webhooks."""

import hashlib
import hmac
import json
import time
from typing import Any, Callable, Dict, List, Optional


class WebhookHandlerError(Exception):
    """Deterministic webhook verification error."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


SIGNED_PROVIDERS = {"clickup", "github", "linear", "slack"}
INVALID_WEBHOOK_SIGNATURE = "Invalid webhook signature"


class WebhookHandler:
    """Handles incoming webhooks from providers."""

    def __init__(self, provider_registry: Any, logger: Any):
        self.provider_registry = provider_registry
        self.logger = logger
        self._handlers: Dict[str, Dict[str, List[Callable]]] = {}

    def register_handler(self, provider: str, event: str, handler: Callable) -> None:
        if provider not in self._handlers:
            self._handlers[provider] = {}
        if event not in self._handlers[provider]:
            self._handlers[provider][event] = []

        self._handlers[provider][event].append(handler)
        self.logger.info(f"Registered webhook handler for {provider}.{event}")

    def unregister_handler(self, provider: str, event: str, handler: Callable) -> None:
        if (
            provider in self._handlers
            and event in self._handlers[provider]
            and handler in self._handlers[provider][event]
        ):
            self._handlers[provider][event].remove(handler)
            self.logger.info(f"Unregistered webhook handler for {provider}.{event}")

    async def handle_webhook(
        self,
        provider: str,
        event: str,
        payload: Optional[Dict[str, Any]],
        headers: Dict[str, str],
        secret: Optional[str] = None,
        raw_body: Optional[bytes] = None,
    ) -> List[Any]:
        provider_obj = self.provider_registry.get_provider(provider)
        if not provider_obj:
            raise WebhookHandlerError("VALIDATION_ERROR", f"Provider {provider} not found", 404)

        normalized_headers = _normalize_headers(headers)
        signed_provider = provider in SIGNED_PROVIDERS
        if signed_provider:
            if not secret:
                raise WebhookHandlerError(
                    "WEBHOOK_SECRET_NOT_FOUND",
                    f"secret not configured for {provider}",
                    400,
                )
            if raw_body is None:
                raise WebhookHandlerError(
                    "WEBHOOK_RAW_BODY_REQUIRED",
                    f"raw request body is required for {provider}",
                    400,
                )
            self._verify_signature(provider, raw_body, normalized_headers, secret)

        parsed_payload = payload if payload is not None else _parse_payload(raw_body)
        handlers = self._handlers.get(provider, {}).get(event, [])
        if not handlers:
            self.logger.warn(f"No handlers registered for {provider}.{event}")
            return []

        results: List[Any] = []
        failures: List[Exception] = []
        for handler in handlers:
            try:
                results.append(await handler(parsed_payload))
            except Exception as error:
                self.logger.error(
                    f"Error in webhook handler for {provider}.{event}: {str(error)}",
                    {"error": str(error)},
                )
                failures.append(error)

        if failures:
            raise WebhookHandlerError(
                "WEBHOOK_HANDLER_FAILED", "Webhook handler failed", 503
            ) from failures[0]

        return results

    def _verify_signature(
        self, provider: str, raw_body: bytes, headers: Dict[str, str], secret: str
    ) -> None:
        if provider == "github":
            _verify_github_signature(raw_body, headers, secret)
        elif provider == "slack":
            _verify_slack_signature(raw_body, headers, secret)
        elif provider == "linear":
            _verify_linear_signature(raw_body, headers, secret)
        elif provider == "clickup":
            _verify_clickup_signature(raw_body, headers, secret)


def _verify_github_signature(
    raw_body: bytes, headers: Dict[str, str], secret: str
) -> None:
    signature_header = headers.get("x-hub-signature-256", "")
    if not signature_header:
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", "Missing signature header")

    expected_signature = "sha256=" + hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature_header, expected_signature):
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", INVALID_WEBHOOK_SIGNATURE)


def _verify_slack_signature(
    raw_body: bytes, headers: Dict[str, str], secret: str
) -> None:
    signature_header = headers.get("x-slack-signature", "")
    timestamp = headers.get("x-slack-request-timestamp", "")
    if not signature_header or not timestamp:
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", "Missing signature headers")
    try:
        timestamp_value = int(timestamp)
    except (TypeError, ValueError) as error:
        raise WebhookHandlerError(
            "WEBHOOK_SIGNATURE_INVALID", "Invalid request timestamp"
        ) from error
    if abs(time.time() - timestamp_value) > 60 * 5:
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", "Request timestamp too old")

    signature_payload = f"v0:{timestamp}:".encode("utf-8") + raw_body
    expected_signature = "v0=" + hmac.new(
        secret.encode("utf-8"), signature_payload, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature_header, expected_signature):
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", INVALID_WEBHOOK_SIGNATURE)


def _verify_linear_signature(
    raw_body: bytes, headers: Dict[str, str], secret: str
) -> None:
    signature_header = (
        headers.get("linear-signature", "")
        or headers.get("x-linear-signature", "")
        or headers.get("x-signature", "")
    )
    if not signature_header:
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", "Missing signature header")

    expected_signature = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    normalized_signature = signature_header.removeprefix("sha256=")
    if not hmac.compare_digest(normalized_signature, expected_signature):
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", INVALID_WEBHOOK_SIGNATURE)


def _verify_clickup_signature(raw_body: bytes, headers: Dict[str, str], secret: str) -> None:
    signature_header = headers.get("x-signature", "")
    if not signature_header:
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", "Missing signature header")

    expected_signature = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    normalized_signature = signature_header.removeprefix("sha256=")
    if not hmac.compare_digest(normalized_signature, expected_signature):
        raise WebhookHandlerError("WEBHOOK_SIGNATURE_INVALID", INVALID_WEBHOOK_SIGNATURE)


def _normalize_headers(headers: Dict[str, str]) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    for key, value in headers.items():
        normalized[key.lower()] = value
    return normalized


def _parse_payload(raw_body: Optional[bytes]) -> Dict[str, Any]:
    if not raw_body:
        return {}

    try:
        parsed = json.loads(raw_body.decode("utf-8"))
    except Exception as error:
        raise WebhookHandlerError("VALIDATION_ERROR", f"invalid webhook payload: {error}") from error

    if not isinstance(parsed, dict):
        raise WebhookHandlerError("VALIDATION_ERROR", "webhook payload must be a JSON object")

    return parsed
