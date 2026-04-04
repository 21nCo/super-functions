"""Email OTP plugin and challenge service for authfn Python."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from ..config import resolve_runtime
from ..observability import emit_auth_event, event_request_id
from ..types import (
    AuthFnError,
    AuthFnConfig,
    AuthFnHookContext,
    AuthFnPlugin,
    DeliveryFailedError,
    OtpExpiredError,
    OtpInvalidError,
    OtpReplayedError,
    PluginAbortedError,
    ValidationError,
)


def _default_code_generator() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def _default_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise ValidationError("A valid email is required")
    return normalized


def _hash_code(code: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        code.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
        dklen=32,
    )
    return "$".join(["pbkdf2-sha256", "200000", salt, digest.hex()])


def _verify_code_hash(stored_hash: str, code: str) -> bool:
    parts = stored_hash.split("$")
    if len(parts) == 4 and parts[0] == "pbkdf2-sha256":
        iterations = int(parts[1])
        salt = parts[2]
        expected = parts[3]
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            code.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
            dklen=32,
        ).hex()
        return hmac.compare_digest(digest, expected)
    return hmac.compare_digest(stored_hash, hashlib.sha256(code.encode("utf-8")).hexdigest())


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    if hasattr(hashlib, "scrypt"):
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt.encode("utf-8"),
            n=16384,
            r=8,
            p=1,
            dklen=64,
        )
        return "$".join(["scrypt", "16384", "8", "1", salt, derived.hex()])

    iterations = 600_000
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
        dklen=64,
    )
    return "$".join(["pbkdf2-sha256", str(iterations), salt, derived.hex()])


def _create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


@dataclass
class EmailOtpPluginConfig:
    delivery: Optional[Any] = None
    code_generator: Callable[[], str] = _default_code_generator
    now: Callable[[], datetime] = _default_now
    challenge_ttl_seconds: int = 600
    max_attempts: int = 5


class EmailOtpService:
    """Lifecycle manager for email OTP challenges."""

    def __init__(self, config: AuthFnConfig, plugin_config: Optional[EmailOtpPluginConfig] = None):
        self.config = config
        self.plugin_config = plugin_config or EmailOtpPluginConfig()

    async def send_challenge(
        self,
        purpose: str,
        email: str,
        metadata: Optional[Dict[str, Any]] = None,
        *,
        request: Any = None,
        runtime: Any = None,
    ) -> Dict[str, Any]:
        resolved_runtime = runtime or (resolve_runtime(self.config, request) if request is not None else None)
        payload = {
            "purpose": purpose,
            "email": _normalize_email(email),
            "metadata": metadata or {},
        }
        payload = await self._run_before_send(payload, request=request, runtime=resolved_runtime)

        code = self.plugin_config.code_generator()
        if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
            raise ValidationError("OTP code generator must produce a 6 digit string")

        now = self.plugin_config.now()
        challenge = {
            "id": _create_id("otp"),
            "purpose": payload["purpose"],
            "email": _normalize_email(payload["email"]),
            "codeHash": _hash_code(code),
            "attemptCount": 0,
            "deliveryMetadata": dict(payload.get("metadata", {})),
            "expiresAt": now + timedelta(seconds=self.plugin_config.challenge_ttl_seconds),
            "consumedAt": None,
            "createdAt": now,
            "updatedAt": now,
        }

        await self.config.database.create(
            model="otp_challenges",
            data=challenge,
            namespace=self.config.namespace,
        )

        delivery = await self._deliver(challenge, code)
        if delivery.get("metadata"):
            challenge["deliveryMetadata"] = {
                **challenge["deliveryMetadata"],
                **delivery["metadata"],
            }
            challenge["updatedAt"] = self.plugin_config.now()
            await self.config.database.update(
                model="otp_challenges",
                where=[{"field": "id", "operator": "eq", "value": challenge["id"]}],
                data={
                    "deliveryMetadata": challenge["deliveryMetadata"],
                    "updatedAt": challenge["updatedAt"],
                },
                namespace=self.config.namespace,
            )

        await self._run_after_send(challenge, request=request, runtime=resolved_runtime)
        await self._emit(
            {
                "type": "authfn.otp.sent",
                "challengeId": challenge["id"],
                "purpose": challenge["purpose"],
                "email": challenge["email"],
                "outcome": "sent",
                "metadata": {"deliveryMetadata": challenge["deliveryMetadata"]},
            }
        )
        await emit_auth_event(
            self.config,
            {
                "type": "authfn.otp.sent",
                "requestId": event_request_id(request),
                "outcome": "sent",
                "metadata": {
                    "challengeId": challenge["id"],
                    "purpose": challenge["purpose"],
                    "email": challenge["email"],
                },
            },
        )

        return {"challenge": challenge, "sent": True}

    async def verify_challenge(
        self,
        purpose: str,
        email: str,
        code: str,
        *,
        request: Any = None,
        runtime: Any = None,
    ) -> Dict[str, Any]:
        challenge = await self._find_latest_challenge(purpose, _normalize_email(email))
        if challenge is None:
            raise OtpInvalidError("OTP code is invalid")

        now = self.plugin_config.now()
        if challenge.get("consumedAt") is not None:
            raise OtpReplayedError("OTP code has already been used")
        if challenge["expiresAt"] <= now:
            raise OtpExpiredError("OTP code has expired")

        next_attempt_count = challenge["attemptCount"] + 1
        if next_attempt_count >= self.plugin_config.max_attempts:
            await self._touch_attempt(challenge["id"], next_attempt_count, now)
            raise OtpInvalidError("OTP code is invalid")

        if not _verify_code_hash(challenge["codeHash"], code):
            await self._touch_attempt(challenge["id"], next_attempt_count, now)
            raise OtpInvalidError("OTP code is invalid")

        challenge["attemptCount"] = next_attempt_count
        challenge["consumedAt"] = now
        challenge["updatedAt"] = now
        await self.config.database.update(
            model="otp_challenges",
            where=[{"field": "id", "operator": "eq", "value": challenge["id"]}],
            data={
                "attemptCount": next_attempt_count,
                "consumedAt": now,
                "updatedAt": now,
            },
            namespace=self.config.namespace,
        )

        user = await self._find_user_by_email(challenge["email"])
        if purpose == "verify-email" and user is not None:
            user["emailVerifiedAt"] = now
            user["updatedAt"] = now
            await self.config.database.update(
                model="users",
                where=[{"field": "id", "operator": "eq", "value": user["id"]}],
                data={"emailVerifiedAt": now, "updatedAt": now},
                namespace=self.config.namespace,
            )

        await self._emit(
            {
                "type": "authfn.otp.verified",
                "challengeId": challenge["id"],
                "purpose": challenge["purpose"],
                "email": challenge["email"],
                "outcome": "verified",
            }
        )
        await emit_auth_event(
            self.config,
            {
                "type": "authfn.otp.verified",
                "requestId": event_request_id(request),
                "actorId": user["id"] if user else None,
                "userId": user["id"] if user else None,
                "outcome": "verified",
                "metadata": {
                    "challengeId": challenge["id"],
                    "purpose": challenge["purpose"],
                    "email": challenge["email"],
                },
            },
        )

        return {"verified": True, "challenge": challenge, "user": user}

    async def complete_reset_password(
        self,
        email: str,
        code: str,
        new_password: str,
        *,
        request: Any = None,
        runtime: Any = None,
    ) -> Dict[str, Any]:
        if len(new_password) < 12:
            raise ValidationError("Password must be at least 12 characters")

        result = await self.verify_challenge(
            "reset-password",
            email,
            code,
            request=request,
            runtime=runtime,
        )
        user = result.get("user") or await self._find_user_by_email(_normalize_email(email))
        if user is None:
            raise OtpInvalidError("Password reset requires an existing user")

        credential = await self.config.database.find_one(
            model="password_credentials",
            where=[{"field": "userId", "operator": "eq", "value": user["id"]}],
            namespace=self.config.namespace,
        )
        password_hash = _hash_password(new_password)
        updated_at = self.plugin_config.now()

        if credential is None:
            await self.config.database.create(
                model="password_credentials",
                data={
                    "id": _create_id("pwd"),
                    "userId": user["id"],
                    "passwordHash": password_hash,
                    "createdAt": updated_at,
                    "updatedAt": updated_at,
                },
                namespace=self.config.namespace,
            )
        else:
            await self.config.database.update(
                model="password_credentials",
                where=[{"field": "userId", "operator": "eq", "value": user["id"]}],
                data={"passwordHash": password_hash, "updatedAt": updated_at},
                namespace=self.config.namespace,
            )

        return {"passwordUpdated": True}

    async def _deliver(self, challenge: Dict[str, Any], code: str) -> Dict[str, Any]:
        provider = self.plugin_config.delivery
        if provider is None:
            raise DeliveryFailedError("No OTP delivery provider configured")

        try:
            result = await provider.send(
                {
                    "channel": "email",
                    "challengeId": challenge["id"],
                    "purpose": challenge["purpose"],
                    "email": challenge["email"],
                    "code": code,
                    "metadata": challenge["deliveryMetadata"],
                }
            )
        except DeliveryFailedError:
            raise
        except Exception as error:  # noqa: BLE001
            raise DeliveryFailedError(str(error)) from error

        if not result or not result.get("sent"):
            raise DeliveryFailedError("OTP delivery provider reported an unsent challenge")
        return result

    async def _emit(self, event: Dict[str, Any]) -> None:
        provider = self.plugin_config.delivery
        emit = getattr(provider, "emit", None)
        if emit is None:
            return
        try:
            await emit(event)
        except Exception:  # noqa: BLE001
            return

    async def _run_before_send(
        self,
        payload: Dict[str, Any],
        *,
        request: Any = None,
        runtime: Any = None,
    ) -> Dict[str, Any]:
        hooks = self.config.hooks
        before_send = getattr(hooks, "before_challenge_send", None) if hooks else None
        if before_send is None:
            return payload
        try:
            result = await before_send(
                AuthFnHookContext(config=self.config, request=request, runtime=runtime),
                payload,
            )
        except AuthFnError:
            raise
        except Exception as error:  # noqa: BLE001
            await emit_auth_event(
                self.config,
                {
                    "type": "authfn.plugin.failed",
                    "requestId": event_request_id(request),
                    "pluginName": "config",
                    "hookName": "beforeChallengeSend",
                    "outcome": "aborted",
                    "metadata": {"errorCode": "AUTHFN_INTERNAL_ERROR", "retryable": False},
                },
            )
            raise PluginAbortedError(
                "beforeChallengeSend hook aborted OTP send",
                {"cause": str(error)},
            ) from error
        return result or payload

    async def _run_after_send(
        self,
        challenge: Dict[str, Any],
        *,
        request: Any = None,
        runtime: Any = None,
    ) -> None:
        hooks = self.config.hooks
        after_send = getattr(hooks, "after_challenge_send", None) if hooks else None
        if after_send is None:
            return
        try:
            await after_send(
                AuthFnHookContext(config=self.config, request=request, runtime=runtime),
                {
                    "challengeId": challenge["id"],
                    "purpose": challenge["purpose"],
                    "email": challenge["email"],
                    "sent": True,
                    "deliveryMetadata": challenge["deliveryMetadata"],
                },
            )
        except Exception:  # noqa: BLE001
            await emit_auth_event(
                self.config,
                {
                    "type": "authfn.plugin.failed",
                    "requestId": event_request_id(request),
                    "pluginName": "config",
                    "hookName": "afterChallengeSend",
                    "outcome": "observed",
                    "metadata": {"errorCode": "AUTHFN_INTERNAL_ERROR", "retryable": False},
                },
            )
            return

    async def _find_latest_challenge(self, purpose: str, email: str) -> Optional[Dict[str, Any]]:
        rows = await self.config.database.find_many(
            model="otp_challenges",
            where=[
                {"field": "purpose", "operator": "eq", "value": purpose},
                {"field": "email", "operator": "eq", "value": email},
            ],
            order_by=[{"field": "createdAt", "direction": "desc"}],
            namespace=self.config.namespace,
        )
        return rows[0] if rows else None

    async def _touch_attempt(self, challenge_id: str, attempt_count: int, updated_at: datetime) -> None:
        await self.config.database.update(
            model="otp_challenges",
            where=[{"field": "id", "operator": "eq", "value": challenge_id}],
            data={"attemptCount": attempt_count, "updatedAt": updated_at},
            namespace=self.config.namespace,
        )

    async def _find_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return await self.config.database.find_one(
            model="users",
            where=[{"field": "primaryEmail", "operator": "eq", "value": email}],
            namespace=self.config.namespace,
        )


def authfn_email_otp_plugin(config: Optional[EmailOtpPluginConfig] = None) -> AuthFnPlugin:
    resolved = config or EmailOtpPluginConfig()
    plugin = AuthFnPlugin(
        name="emailOtp",
        schema_factory=lambda _config: [
            {
                "modelName": "otp_challenges",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "purpose": {"type": "string", "required": True, "fieldName": "purpose"},
                    "email": {"type": "string", "required": True, "fieldName": "email"},
                    "codeHash": {"type": "string", "required": True, "fieldName": "code_hash"},
                    "attemptCount": {
                        "type": "number",
                        "required": True,
                        "fieldName": "attempt_count",
                    },
                    "deliveryMetadata": {
                        "type": "json",
                        "required": False,
                        "fieldName": "delivery_metadata",
                    },
                    "expiresAt": {"type": "date", "required": True, "fieldName": "expires_at"},
                    "consumedAt": {
                        "type": "date",
                        "required": False,
                        "fieldName": "consumed_at",
                    },
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                    "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                },
                "indexes": [
                    {
                        "name": "idx_authfn_otp_challenges_email_purpose_created_at",
                        "fields": ["email", "purpose", "createdAt"],
                    },
                    {
                        "name": "idx_authfn_otp_challenges_expires_at",
                        "fields": ["expiresAt"],
                    },
                ],
            }
        ],
        routes_factory=lambda _ctx: [
            {"method": "POST", "path": "/otp/send"},
            {"method": "POST", "path": "/otp/verify"},
            {"method": "POST", "path": "/password/reset/start"},
            {"method": "POST", "path": "/password/reset/complete"},
        ],
        hooks=None,
        validate_config=None,
    )
    setattr(plugin, "_authfn_config", resolved)
    return plugin


__all__ = [
    "EmailOtpPluginConfig",
    "EmailOtpService",
    "authfn_email_otp_plugin",
]
