"""Two-factor plugin tests for authfn Python."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import pytest

TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from authfn import AuthFnConfig, TwoFactorInvalidCodeError
from authfn.plugins.two_factor import (
    BASE32_ALPHABET,
    TwoFactorPluginConfig,
    TwoFactorService,
    authfn_two_factor_plugin,
)
from authfn.types import ValidationError

TEST_2FA_KEY = b"authfn-python-two-factor-test-key"


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            "two_factor_enrollments": [],
            "two_factor_recovery_codes": [],
            "two_factor_challenges": [],
        }

    async def find_one(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                return row
        return None

    async def find_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        order_by: Optional[List[Dict[str, Any]]] = None,
        namespace: str = "authfn",
    ) -> List[Dict[str, Any]]:
        rows = [row for row in self.storage.get(model, []) if _matches(row, where)]
        if order_by:
            for entry in reversed(order_by):
                reverse = entry["direction"] == "desc"
                rows.sort(key=lambda item: item.get(entry["field"]), reverse=reverse)
        return rows

    async def create(self, model: str, data: Dict[str, Any], namespace: str) -> Dict[str, Any]:
        self.storage.setdefault(model, []).append(dict(data))
        return self.storage[model][-1]

    async def update(
        self,
        model: str,
        where: List[Dict[str, Any]],
        data: Dict[str, Any],
        namespace: str,
    ) -> Dict[str, Any]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                row.update(data)
                return row
        raise AssertionError(f"row not found in {model}")

    async def delete_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> int:
        rows = self.storage.get(model, [])
        kept = [row for row in rows if not _matches(row, where)]
        deleted = len(rows) - len(kept)
        self.storage[model] = kept
        return deleted


def _matches(row: Dict[str, Any], clauses: List[Dict[str, Any]]) -> bool:
    for clause in clauses:
        operator = clause["operator"]
        field = clause["field"]
        value = clause["value"]
        if operator == "eq" and row.get(field) != value:
            return False
    return True


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


def _generate_totp(secret: str, now: datetime, digits: int = 6, period_seconds: int = 30) -> str:
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


@pytest.mark.asyncio
async def test_two_factor_plugin_schema_and_routes() -> None:
    plugin = authfn_two_factor_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )

    assert {table["modelName"] for table in schema} == {
        "two_factor_enrollments",
        "two_factor_recovery_codes",
        "two_factor_challenges",
    }
    assert {route["path"] for route in routes} == {
        "/2fa/enroll",
        "/2fa/confirm",
        "/2fa/challenge",
        "/2fa/disable",
    }


@pytest.mark.asyncio
async def test_enroll_confirm_challenge_recovery_and_disable() -> None:
    db = MockDatabaseAdapter()
    now = datetime(2026, 3, 22, 0, 0, 0)
    service = TwoFactorService(
        AuthFnConfig(database=db, namespace="authfn"),
        TwoFactorPluginConfig(
            issuer="authfn-tests",
            now=lambda: now,
            recovery_code_count=3,
            encryption_key_resolver=lambda _key_ref: TEST_2FA_KEY,
        ),
    )

    enrolled = await service.enroll(user_id="user_1", primary_email="ada@example.com")
    assert enrolled["secret"]
    assert len(enrolled["recoveryCodes"]) == 3
    assert db.storage["two_factor_enrollments"][0]["secretEncrypted"] != enrolled["secret"]
    assert db.storage["two_factor_recovery_codes"][0]["codeHash"].startswith("pbkdf2-sha256$")

    await service.confirm(
        user_id="user_1",
        code=_generate_totp(enrolled["secret"], now),
    )
    assert db.storage["two_factor_enrollments"][0]["confirmedAt"] == now

    challenge = await service.begin_sign_in_challenge(
        user_id="user_1",
        primary_method="password",
    )
    assert challenge is not None
    satisfied = await service.complete_sign_in_challenge(
        challenge_id=challenge["id"],
        code=_generate_totp(enrolled["secret"], now),
        primary_email="ada@example.com",
    )
    assert satisfied["twoFactorSatisfied"] is True
    assert satisfied["session"].methods == ["password", "two-factor"]

    recovery_challenge = await service.begin_sign_in_challenge(
        user_id="user_1",
        primary_method="password",
    )
    recovery = enrolled["recoveryCodes"][0]
    recovery_result = await service.complete_sign_in_challenge(
        challenge_id=recovery_challenge["id"],
        code=recovery,
        primary_email="ada@example.com",
    )
    assert recovery_result["usedRecoveryCode"] is True

    reused = await service.begin_sign_in_challenge(
        user_id="user_1",
        primary_method="password",
    )
    with pytest.raises(TwoFactorInvalidCodeError):
        await service.complete_sign_in_challenge(
            challenge_id=reused["id"],
            code=recovery,
            primary_email="ada@example.com",
        )

    disabled = await service.disable(
        user_id="user_1",
        code=_generate_totp(enrolled["secret"], now),
    )
    assert disabled == {"disabled": True}
    assert await service.begin_sign_in_challenge(user_id="user_1", primary_method="password") is None


@pytest.mark.asyncio
async def test_two_factor_requires_explicit_encryption_key_resolver() -> None:
    service = TwoFactorService(
        AuthFnConfig(database=MockDatabaseAdapter(), namespace="authfn"),
        TwoFactorPluginConfig(),
    )

    with pytest.raises(ValidationError) as error:
        await service.enroll(user_id="user_1", primary_email="ada@example.com")

    assert "encryption_key_resolver" in str(error.value)
