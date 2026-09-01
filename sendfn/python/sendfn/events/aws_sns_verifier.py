"""AWS SNS signature verification helpers for SES webhooks."""

from __future__ import annotations

import asyncio
import base64
import re
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Optional
from urllib.parse import urlparse
from urllib.request import urlopen

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from ..errors import SendfnError

CERT_HOST_PATTERN = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com$", re.IGNORECASE)


def create_webhook_error(code: str, message: str) -> SendfnError:
    """Create a stable webhook error."""
    return SendfnError(message, code=code, retryable=False)


class AwsSnsVerifier:
    """Verify AWS SNS envelopes before SES lifecycle processing."""

    def __init__(
        self,
        *,
        now: Optional[Callable[[], datetime]] = None,
        fetch_certificate: Optional[Callable[[str], str]] = None,
        verify_signature: Optional[Callable[[str, str, str], bool]] = None,
        confirm_subscription: Optional[Callable[[str], None]] = None,
        max_age_seconds: Optional[int] = None,
        topic_arns: Optional[Iterable[str]] = None,
    ) -> None:
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.fetch_certificate = fetch_certificate or self._default_fetch_certificate
        self.verify_signature = verify_signature or self._default_verify_signature
        self._confirm_subscription = confirm_subscription or self._default_confirm_subscription
        self.max_age_seconds = max_age_seconds
        self.topic_arns = set(topic_arns or ())

    async def verify(self, message: dict[str, Any]) -> None:
        """Verify SNS envelope shape, freshness, cert host, and signature."""
        self._validate_envelope_shape(message)
        if message["TopicArn"] not in self.topic_arns:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )
        self._validate_signing_cert_url(message["SigningCertURL"])
        self._validate_timestamp(message["Timestamp"])

        canonical_message = self._build_canonical_message(message)
        certificate = await asyncio.to_thread(
            self.fetch_certificate,
            message["SigningCertURL"],
        )

        try:
            is_valid = self.verify_signature(
                canonical_message,
                message["Signature"],
                certificate,
            )
        except Exception as exc:  # pragma: no cover - fail-closed branch
            raise create_webhook_error(
                "SENDFN_WEBHOOK_SIGNATURE_INVALID",
                "SNS signature verification failed",
            ) from exc

        if not is_valid:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_SIGNATURE_INVALID",
                "SNS signature verification failed",
            )

    async def confirm_subscription(self, message: dict[str, Any]) -> None:
        """Confirm a verified SNS subscription handshake."""
        if message.get("Type") != "SubscriptionConfirmation" or not message.get("SubscribeURL"):
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )
        self._validate_sns_url(str(message["SubscribeURL"]))
        try:
            await asyncio.to_thread(
                self._confirm_subscription,
                str(message["SubscribeURL"]),
            )
        except SendfnError:
            raise
        except Exception as exc:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_CONFIRMATION_FAILED",
                "SNS subscription confirmation failed",
            ) from exc

    def _validate_envelope_shape(self, message: dict[str, Any]) -> None:
        required_fields = [
            "Type",
            "Message",
            "MessageId",
            "TopicArn",
            "Timestamp",
            "SignatureVersion",
            "Signature",
            "SigningCertURL",
        ]
        for field in required_fields:
            value = message.get(field)
            if not isinstance(value, str) or not value.strip():
                raise create_webhook_error(
                    "SENDFN_WEBHOOK_MESSAGE_INVALID",
                    "SNS message is malformed",
                )

        if message["Type"] not in {"Notification", "SubscriptionConfirmation"} or message["SignatureVersion"] != "1":
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )
        if message["Type"] == "SubscriptionConfirmation":
            for field in ("Token", "SubscribeURL"):
                value = message.get(field)
                if not isinstance(value, str) or not value.strip():
                    raise create_webhook_error(
                        "SENDFN_WEBHOOK_MESSAGE_INVALID",
                        "SNS message is malformed",
                    )
            self._validate_sns_url(message["SubscribeURL"])

    def _validate_signing_cert_url(self, signing_cert_url: str) -> None:
        parsed = urlparse(signing_cert_url)
        if parsed.scheme != "https" or not CERT_HOST_PATTERN.match(parsed.hostname or ""):
            raise create_webhook_error(
                "SENDFN_WEBHOOK_SIGNATURE_INVALID",
                "SNS signature verification failed",
            )

    def _validate_timestamp(self, timestamp: str) -> None:
        parsed = self._parse_timestamp(timestamp)
        age = abs((self.now() - parsed).total_seconds())
        if self.max_age_seconds is not None and age > self.max_age_seconds:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

    def _parse_timestamp(self, timestamp: str) -> datetime:
        normalized = timestamp.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            ) from exc

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _build_canonical_message(self, message: dict[str, Any]) -> str:
        if message["Type"] == "SubscriptionConfirmation":
            ordered_fields = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
        else:
            ordered_fields = ["Message", "MessageId"]
            if message.get("Subject"):
                ordered_fields.append("Subject")
            ordered_fields.extend(["Timestamp", "TopicArn", "Type"])
        return "\n".join(f"{field}\n{message.get(field, '')}" for field in ordered_fields) + "\n"

    def _validate_sns_url(self, value: str) -> None:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not CERT_HOST_PATTERN.match(parsed.hostname or ""):
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

    def _default_confirm_subscription(self, url: str) -> None:
        try:
            with urlopen(url, timeout=5) as response:
                response.read()
        except Exception as exc:  # pragma: no cover - network failure
            raise create_webhook_error(
                "SENDFN_WEBHOOK_CONFIRMATION_FAILED",
                "SNS subscription confirmation failed",
            ) from exc

    def _default_fetch_certificate(self, url: str) -> str:
        try:
            with urlopen(url, timeout=5) as response:
                payload = response.read().decode("utf-8")
        except Exception as exc:  # pragma: no cover - network failure
            raise create_webhook_error(
                "SENDFN_WEBHOOK_SIGNATURE_INVALID",
                "SNS signature verification failed",
            ) from exc
        return str(payload)

    def _default_verify_signature(
        self, canonical_message: str, signature: str, certificate: str
    ) -> bool:
        try:
            signature_bytes = base64.b64decode(signature, validate=True)
            parsed_certificate = x509.load_pem_x509_certificate(certificate.encode("utf-8"))
            public_key = parsed_certificate.public_key()
            if not isinstance(public_key, rsa.RSAPublicKey):
                return False
            public_key.verify(
                signature_bytes,
                canonical_message.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA1(),
            )
            return True
        except (InvalidSignature, TypeError, ValueError):
            return False
