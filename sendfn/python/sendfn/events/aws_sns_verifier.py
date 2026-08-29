"""AWS SNS signature verification helpers for SES webhooks."""

from __future__ import annotations

import base64
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Any, Callable, Optional
from urllib.parse import urlparse
from urllib.request import urlopen

from ..errors import SendfnError

CERT_HOST_PATTERN = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com$", re.IGNORECASE)
DEFAULT_MAX_AGE_SECONDS = 5 * 60


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
        max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    ) -> None:
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.fetch_certificate = fetch_certificate or self._default_fetch_certificate
        self.verify_signature = verify_signature or self._default_verify_signature
        self.max_age_seconds = max_age_seconds

    async def verify(self, message: dict[str, Any]) -> None:
        """Verify SNS envelope shape, freshness, cert host, and signature."""
        self._validate_envelope_shape(message)
        self._validate_signing_cert_url(message["SigningCertURL"])
        self._validate_timestamp(message["Timestamp"])

        canonical_message = self._build_canonical_message(message)
        certificate = self.fetch_certificate(message["SigningCertURL"])

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

    def _validate_envelope_shape(self, message: dict[str, Any]) -> None:
        required_fields = [
            "Type",
            "Message",
            "MessageId",
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

        if message["Type"] != "Notification" or message["SignatureVersion"] != "1":
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

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
        if age > self.max_age_seconds:
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
        ordered_fields = ["Message", "MessageId"]
        if message.get("Subject"):
            ordered_fields.append("Subject")
        ordered_fields.extend(["Timestamp", "TopicArn", "Type"])
        return "\n".join(f"{field}\n{message.get(field, '')}" for field in ordered_fields)

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
        signature_bytes = base64.b64decode(signature)

        with tempfile.TemporaryDirectory() as tmpdir:
            cert_path = os.path.join(tmpdir, "cert.pem")
            pubkey_path = os.path.join(tmpdir, "pubkey.pem")
            payload_path = os.path.join(tmpdir, "payload.txt")
            signature_path = os.path.join(tmpdir, "signature.bin")

            with open(cert_path, "w", encoding="utf-8") as cert_file:
                cert_file.write(certificate)
            with open(payload_path, "w", encoding="utf-8") as payload_file:
                payload_file.write(canonical_message)
            with open(signature_path, "wb") as signature_file:
                signature_file.write(signature_bytes)

            extract = subprocess.run(
                ["openssl", "x509", "-pubkey", "-noout", "-in", cert_path],
                capture_output=True,
                text=True,
                check=False,
            )
            if extract.returncode != 0:
                return False

            with open(pubkey_path, "w", encoding="utf-8") as pubkey_file:
                pubkey_file.write(extract.stdout)

            verify = subprocess.run(
                [
                    "openssl",
                    "dgst",
                    "-sha1",
                    "-verify",
                    pubkey_path,
                    "-signature",
                    signature_path,
                    payload_path,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            return verify.returncode == 0
