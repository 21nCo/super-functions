"""Two-factor plugin and service for authfn Python."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote

from cryptography.fernet import Fernet

from ..types import (
    AuthFnConfig,
    AuthFnPlugin,
    AuthFnSession,
    NotFoundError,
    TwoFactorInvalidCodeError,
    TwoFactorRequiredError,
    ValidationError,
)

BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def _default_now() -> datetime:
    return datetime.now(timezone.utc)


def _create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _hash_code(code: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        _normalize_code(code).encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
        dklen=32,
    )
    return "$".join(["pbkdf2-sha256", "200000", salt, digest.hex()])


def _verify_code_hash(stored_hash: str, code: str) -> bool:
    normalized = _normalize_code(code)
    parts = stored_hash.split("$")
    if len(parts) == 4 and parts[0] == "pbkdf2-sha256":
        iterations = int(parts[1])
        salt = parts[2]
        expected = parts[3]
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            normalized.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
            dklen=32,
        ).hex()
        return hmac.compare_digest(digest, expected)
    return hmac.compare_digest(stored_hash, hashlib.sha256(normalized.encode("utf-8")).hexdigest())


def _normalize_code(code: str) -> str:
    return code.replace(" ", "").replace("-", "").upper()


def _generate_secret() -> str:
    raw = secrets.token_bytes(20)
    bits = 0
    buffer = 0
    encoded = []
    for byte in raw:
        buffer = (buffer << 8) | byte
        bits += 8
        while bits >= 5:
            encoded.append(BASE32_ALPHABET[(buffer >> (bits - 5)) & 31])
            bits -= 5
    if bits > 0:
        encoded.append(BASE32_ALPHABET[(buffer << (5 - bits)) & 31])
    return "".join(encoded)


def _decode_base32(secret: str) -> bytes:
    bits = 0
    buffer = 0
    decoded: List[int] = []
    for char in secret.replace("=", "").upper():
        index = BASE32_ALPHABET.find(char)
        if index < 0:
            continue
        buffer = (buffer << 5) | index
        bits += 5
        if bits >= 8:
            decoded.append((buffer >> (bits - 8)) & 0xFF)
            bits -= 8
    return bytes(decoded)


def _generate_totp(secret: str, now: datetime, digits: int, period_seconds: int) -> str:
    counter = int(now.timestamp() // period_seconds)
    payload = counter.to_bytes(8, "big")
    digest = hmac.new(_decode_base32(secret), payload, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    return str(binary % (10**digits)).zfill(digits)


def _normalize_fernet_key(value: bytes | str) -> bytes:
    if isinstance(value, str):
        value = value.encode("utf-8")
    if len(value) == 44:
        try:
            decoded = base64.urlsafe_b64decode(value)
            if len(decoded) == 32:
                return value
        except Exception:
            pass
    digest = hashlib.sha256(value).digest()
    return base64.urlsafe_b64encode(digest)


@dataclass
class TwoFactorPluginConfig:
    issuer: str = "authfn"
    now: Any = _default_now
    challenge_ttl_seconds: int = 300
    recovery_code_count: int = 10
    digits: int = 6
    period_seconds: int = 30
    window: int = 1
    encryption_key_ref: str = "authfn-2fa"
    encryption_key_resolver: Optional[Callable[[str], bytes | str]] = None


class TwoFactorService:
    def __init__(self, config: AuthFnConfig, plugin_config: Optional[TwoFactorPluginConfig] = None):
        self.config = config
        self.plugin_config = plugin_config or TwoFactorPluginConfig()

    async def enroll(self, *, user_id: str, primary_email: Optional[str] = None) -> Dict[str, Any]:
        existing = await self.config.database.find_one(
            model="two_factor_enrollments",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        if existing is not None and existing.get("confirmedAt") is not None:
            raise ValidationError("Two-factor authentication is already enabled")

        now = self.plugin_config.now()
        secret = _generate_secret()
        encrypted = self._cipher().encrypt(secret.encode("utf-8")).decode("utf-8")
        enrollment = {
            "id": existing["id"] if existing else _create_id("tfa"),
            "userId": user_id,
            "secretEncrypted": encrypted,
            "confirmedAt": None,
            "createdAt": existing["createdAt"] if existing else now,
            "updatedAt": now,
        }
        if existing is None:
            await self.config.database.create(
                model="two_factor_enrollments",
                data=enrollment,
                namespace=self.config.namespace,
            )
        else:
            await self.config.database.update(
                model="two_factor_enrollments",
                where=[{"field": "id", "operator": "eq", "value": existing["id"]}],
                data={
                    "secretEncrypted": encrypted,
                    "confirmedAt": None,
                    "updatedAt": now,
                },
                namespace=self.config.namespace,
            )
            await self.config.database.delete_many(
                model="two_factor_recovery_codes",
                where=[{"field": "enrollmentId", "operator": "eq", "value": existing["id"]}],
                namespace=self.config.namespace,
            )

        recovery_codes = []
        for _ in range(self.plugin_config.recovery_code_count):
            raw = secrets.token_hex(5).upper()
            recovery = f"{raw[:5]}-{raw[5:10]}"
            recovery_codes.append(recovery)
            await self.config.database.create(
                model="two_factor_recovery_codes",
                data={
                    "id": _create_id("recovery"),
                    "enrollmentId": enrollment["id"],
                    "codeHash": _hash_code(recovery),
                    "usedAt": None,
                    "createdAt": now,
                },
                namespace=self.config.namespace,
            )

        label = quote(primary_email or user_id)
        issuer = quote(self.plugin_config.issuer)
        return {
            "enrollmentId": enrollment["id"],
            "secret": secret,
            "otpauthUri": f"otpauth://totp/{issuer}:{label}?secret={secret}&issuer={issuer}&digits={self.plugin_config.digits}&period={self.plugin_config.period_seconds}",
            "recoveryCodes": recovery_codes,
        }

    async def confirm(self, *, user_id: str, code: str) -> Dict[str, Any]:
        enrollment = await self._require_enrollment(user_id, require_confirmed=False)
        secret = self._cipher().decrypt(enrollment["secretEncrypted"].encode("utf-8")).decode("utf-8")
        if not self._verify_totp(secret, code):
            raise TwoFactorInvalidCodeError("Two-factor authentication code is invalid")
        now = self.plugin_config.now()
        await self.config.database.update(
            model="two_factor_enrollments",
            where=[{"field": "id", "operator": "eq", "value": enrollment["id"]}],
            data={"confirmedAt": now, "updatedAt": now},
            namespace=self.config.namespace,
        )
        return {"enabled": True}

    async def begin_sign_in_challenge(self, *, user_id: str, primary_method: str) -> Optional[Dict[str, Any]]:
        enrollment = await self.config.database.find_one(
            model="two_factor_enrollments",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        if enrollment is None or enrollment.get("confirmedAt") is None:
            return None
        now = self.plugin_config.now()
        challenge = {
            "id": _create_id("signin_2fa"),
            "userId": user_id,
            "primaryMethod": primary_method,
            "expiresAt": now + timedelta(seconds=self.plugin_config.challenge_ttl_seconds),
            "consumedAt": None,
            "createdAt": now,
            "updatedAt": now,
        }
        await self.config.database.create(
            model="two_factor_challenges",
            data=challenge,
            namespace=self.config.namespace,
        )
        return challenge

    async def complete_sign_in_challenge(
        self,
        *,
        challenge_id: str,
        code: str,
        primary_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        challenge = await self.config.database.find_one(
            model="two_factor_challenges",
            where=[{"field": "id", "operator": "eq", "value": challenge_id}],
            namespace=self.config.namespace,
        )
        if challenge is None:
            raise NotFoundError("Two-factor challenge not found")
        now = self.plugin_config.now()
        if challenge.get("consumedAt") is not None or challenge["expiresAt"] <= now:
            raise TwoFactorInvalidCodeError("Two-factor challenge is invalid or expired")

        enrollment = await self._require_enrollment(challenge["userId"])
        used_recovery = await self._consume_recovery_code(enrollment["id"], code)
        if not used_recovery:
            secret = self._cipher().decrypt(enrollment["secretEncrypted"].encode("utf-8")).decode("utf-8")
            if not self._verify_totp(secret, code):
                raise TwoFactorInvalidCodeError("Two-factor authentication code is invalid")

        await self.config.database.update(
            model="two_factor_challenges",
            where=[{"field": "id", "operator": "eq", "value": challenge_id}],
            data={"consumedAt": now, "updatedAt": now},
            namespace=self.config.namespace,
        )
        session = AuthFnSession.model_validate(
            {
                "id": _create_id("sess"),
                "type": "session",
                "actorType": "user",
                "actorId": challenge["userId"],
                "methods": [challenge["primaryMethod"], "two-factor"],
                "primaryEmail": primary_email,
            }
        )
        return {"twoFactorSatisfied": True, "session": session, "usedRecoveryCode": used_recovery}

    async def disable(self, *, user_id: str, code: str) -> Dict[str, Any]:
        enrollment = await self._require_enrollment(user_id)
        used_recovery = await self._consume_recovery_code(enrollment["id"], code)
        if not used_recovery:
            secret = self._cipher().decrypt(enrollment["secretEncrypted"].encode("utf-8")).decode("utf-8")
            if not self._verify_totp(secret, code):
                raise TwoFactorInvalidCodeError("Two-factor authentication code is invalid")
        await self.config.database.delete_many(
            model="two_factor_recovery_codes",
            where=[{"field": "enrollmentId", "operator": "eq", "value": enrollment["id"]}],
            namespace=self.config.namespace,
        )
        await self.config.database.delete_many(
            model="two_factor_challenges",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        await self.config.database.delete_many(
            model="two_factor_enrollments",
            where=[{"field": "id", "operator": "eq", "value": enrollment["id"]}],
            namespace=self.config.namespace,
        )
        return {"disabled": True}

    def pending_error(self, challenge: Dict[str, Any]) -> TwoFactorRequiredError:
        return TwoFactorRequiredError(
            "Two-factor authentication required",
            {
                "challengeId": challenge["id"],
                "primaryMethod": challenge["primaryMethod"],
                "expiresAt": challenge["expiresAt"].isoformat(),
                "availableMethods": ["totp", "recovery-code"],
            },
        )

    async def _require_enrollment(
        self,
        user_id: str,
        *,
        require_confirmed: bool = True,
    ) -> Dict[str, Any]:
        enrollment = await self.config.database.find_one(
            model="two_factor_enrollments",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        if enrollment is None:
            raise NotFoundError("Two-factor enrollment not found")
        if require_confirmed and enrollment.get("confirmedAt") is None:
            raise NotFoundError("Two-factor enrollment not found")
        return enrollment

    async def _consume_recovery_code(self, enrollment_id: str, code: str) -> bool:
        rows = await self.config.database.find_many(
            model="two_factor_recovery_codes",
            where=[{"field": "enrollmentId", "operator": "eq", "value": enrollment_id}],
            order_by=[],
            namespace=self.config.namespace,
        )
        for row in rows:
            if row.get("usedAt") is None and _verify_code_hash(row["codeHash"], code):
                await self.config.database.update(
                    model="two_factor_recovery_codes",
                    where=[{"field": "id", "operator": "eq", "value": row["id"]}],
                    data={"usedAt": self.plugin_config.now()},
                    namespace=self.config.namespace,
                )
                return True
        return False

    def _verify_totp(self, secret: str, code: str) -> bool:
        now = self.plugin_config.now()
        normalized = _normalize_code(code)
        for offset in range(-self.plugin_config.window, self.plugin_config.window + 1):
            candidate = _generate_totp(
                secret,
                now + timedelta(seconds=offset * self.plugin_config.period_seconds),
                self.plugin_config.digits,
                self.plugin_config.period_seconds,
            )
            if hmac.compare_digest(candidate, normalized):
                return True
        return False

    def _cipher(self) -> Fernet:
        resolver = self.plugin_config.encryption_key_resolver
        if resolver is None:
            raise ValidationError("Two-factor encryption_key_resolver must be configured")
        return Fernet(_normalize_fernet_key(resolver(self.plugin_config.encryption_key_ref)))


def authfn_two_factor_plugin(config: Optional[TwoFactorPluginConfig] = None) -> AuthFnPlugin:
    resolved = config or TwoFactorPluginConfig()
    plugin = AuthFnPlugin(
        name="twoFactor",
        schema_factory=lambda _cfg: [
            {
                "modelName": "two_factor_enrollments",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "userId": {"type": "string", "required": True, "fieldName": "user_id"},
                    "secretEncrypted": {
                        "type": "string",
                        "required": True,
                        "fieldName": "secret_encrypted",
                    },
                    "confirmedAt": {"type": "date", "required": False, "fieldName": "confirmed_at"},
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                    "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                },
                "indexes": [{"name": "idx_authfn_two_factor_enrollments_user_id", "fields": ["userId"]}],
            },
            {
                "modelName": "two_factor_recovery_codes",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "enrollmentId": {"type": "string", "required": True, "fieldName": "enrollment_id"},
                    "codeHash": {"type": "string", "required": True, "fieldName": "code_hash"},
                    "usedAt": {"type": "date", "required": False, "fieldName": "used_at"},
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                },
                "indexes": [
                    {"name": "idx_authfn_two_factor_recovery_codes_code_hash", "fields": ["codeHash"]},
                    {"name": "idx_authfn_two_factor_recovery_codes_enrollment_id", "fields": ["enrollmentId"]},
                ],
            },
            {
                "modelName": "two_factor_challenges",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "userId": {"type": "string", "required": True, "fieldName": "user_id"},
                    "primaryMethod": {"type": "string", "required": True, "fieldName": "primary_method"},
                    "expiresAt": {"type": "date", "required": True, "fieldName": "expires_at"},
                    "consumedAt": {"type": "date", "required": False, "fieldName": "consumed_at"},
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                    "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                },
                "indexes": [
                    {"name": "idx_authfn_two_factor_challenges_expires_at", "fields": ["expiresAt"]},
                    {"name": "idx_authfn_two_factor_challenges_user_id", "fields": ["userId"]},
                ],
            },
        ],
        routes_factory=lambda _ctx: [
            {"method": "POST", "path": "/2fa/enroll"},
            {"method": "POST", "path": "/2fa/confirm"},
            {"method": "POST", "path": "/2fa/challenge"},
            {"method": "POST", "path": "/2fa/disable"},
        ],
    )
    plugin._authfn_config = resolved
    return plugin


__all__ = [
    "TwoFactorPluginConfig",
    "TwoFactorService",
    "authfn_two_factor_plugin",
]
