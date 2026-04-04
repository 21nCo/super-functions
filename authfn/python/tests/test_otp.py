"""OTP plugin tests for authfn Python."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
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

from authfn import AuthFnConfig, AuthFnHooks, OtpExpiredError, OtpInvalidError, OtpReplayedError
from authfn.plugins.email_otp import EmailOtpPluginConfig, EmailOtpService, authfn_email_otp_plugin


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "password_credentials": [],
            "otp_challenges": [],
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


def _matches(row: Dict[str, Any], clauses: List[Dict[str, Any]]) -> bool:
    for clause in clauses:
        if clause["operator"] == "eq" and row.get(clause["field"]) != clause["value"]:
            return False
    return True


class DeliveryRecorder:
    def __init__(self) -> None:
        self.codes: Dict[str, str] = {}
        self.events: List[Dict[str, Any]] = []

    async def send(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.codes[f'{payload["purpose"]}:{payload["email"]}'] = payload["code"]
        return {"sent": True, "metadata": {"channel": "email"}}

    async def emit(self, event: Dict[str, Any]) -> None:
        self.events.append(event)


class FixedClock:
    def __init__(self, start: datetime) -> None:
        self.current = start

    def now(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current = self.current + delta


@pytest.mark.asyncio
async def test_email_otp_plugin_schema_and_routes() -> None:
    plugin = authfn_email_otp_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )

    assert schema[0]["modelName"] == "otp_challenges"
    assert {route["path"] for route in routes} == {
        "/otp/send",
        "/otp/verify",
        "/password/reset/start",
        "/password/reset/complete",
    }


@pytest.mark.asyncio
async def test_send_verify_replay_and_expire() -> None:
    db = MockDatabaseAdapter()
    delivery = DeliveryRecorder()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))
    await db.create(
        model="users",
        data={
            "id": "user_1",
            "primaryEmail": "ada@example.com",
            "createdAt": clock.now(),
            "updatedAt": clock.now(),
        },
        namespace="authfn",
    )

    service = EmailOtpService(
        AuthFnConfig(database=db, namespace="authfn"),
        EmailOtpPluginConfig(
            delivery=delivery,
            code_generator=lambda: "731942",
            now=clock.now,
        ),
    )

    sent = await service.send_challenge("verify-email", "ada@example.com")
    assert sent["sent"] is True
    stored = db.storage["otp_challenges"][0]
    assert stored["codeHash"] != "731942"
    assert stored["codeHash"].startswith("pbkdf2-sha256$")

    verified = await service.verify_challenge("verify-email", "ada@example.com", "731942")
    assert verified["verified"] is True
    user = await db.find_one(
        model="users",
        where=[{"field": "id", "operator": "eq", "value": "user_1"}],
        namespace="authfn",
    )
    assert user is not None
    assert user["emailVerifiedAt"] == clock.now()

    with pytest.raises(OtpReplayedError):
        await service.verify_challenge("verify-email", "ada@example.com", "731942")

    await service.send_challenge("verify-email", "bea@example.com")
    clock.advance(timedelta(minutes=10, milliseconds=1))
    with pytest.raises(OtpExpiredError):
        await service.verify_challenge("verify-email", "bea@example.com", "731942")

    assert [event["outcome"] for event in delivery.events] == ["sent", "verified", "sent"]
    assert [event["purpose"] for event in delivery.events] == [
        "verify-email",
        "verify-email",
        "verify-email",
    ]
    assert "731942" not in repr(delivery.events)


@pytest.mark.asyncio
async def test_max_attempts_locks_on_configured_limit() -> None:
    db = MockDatabaseAdapter()
    delivery = DeliveryRecorder()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))

    service = EmailOtpService(
        AuthFnConfig(database=db, namespace="authfn"),
        EmailOtpPluginConfig(
            delivery=delivery,
            code_generator=lambda: "731942",
            now=clock.now,
            max_attempts=2,
        ),
    )

    await service.send_challenge("sign-in", "ada@example.com")
    with pytest.raises(OtpInvalidError):
        await service.verify_challenge("sign-in", "ada@example.com", "000000")
    stored = db.storage["otp_challenges"][0]
    assert stored["attemptCount"] == 1
    with pytest.raises(OtpInvalidError):
        await service.verify_challenge("sign-in", "ada@example.com", "000000")
    assert stored["attemptCount"] == 2
    with pytest.raises(OtpInvalidError):
        await service.verify_challenge("sign-in", "ada@example.com", "731942")


@pytest.mark.asyncio
async def test_reset_password_requires_reset_purpose_and_updates_hash() -> None:
    db = MockDatabaseAdapter()
    delivery = DeliveryRecorder()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))
    await db.create(
        model="users",
        data={
            "id": "user_1",
            "primaryEmail": "ada@example.com",
            "createdAt": clock.now(),
            "updatedAt": clock.now(),
        },
        namespace="authfn",
    )
    await db.create(
        model="password_credentials",
        data={
            "id": "pwd_1",
            "userId": "user_1",
            "passwordHash": "old-hash",
            "createdAt": clock.now(),
            "updatedAt": clock.now(),
        },
        namespace="authfn",
    )

    service = EmailOtpService(
        AuthFnConfig(database=db, namespace="authfn"),
        EmailOtpPluginConfig(
            delivery=delivery,
            code_generator=lambda: "945183",
            now=clock.now,
        ),
    )

    await service.send_challenge("verify-email", "ada@example.com")
    with pytest.raises(OtpInvalidError):
        await service.complete_reset_password("ada@example.com", "945183", "An0therSecurePassphrase!")

    await service.send_challenge("reset-password", "ada@example.com")
    result = await service.complete_reset_password(
        "ada@example.com",
        "945183",
        "An0therSecurePassphrase!",
    )
    assert result == {"passwordUpdated": True}
    assert db.storage["password_credentials"][0]["passwordHash"] != "old-hash"


@pytest.mark.asyncio
async def test_before_and_after_send_hooks() -> None:
    db = MockDatabaseAdapter()
    delivery = DeliveryRecorder()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))

    async def before_send(_ctx: Any, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            **payload,
            "email": "transformed@example.com",
            "metadata": {"source": "hook"},
        }

    async def after_send(_ctx: Any, _payload: Dict[str, Any]) -> None:
        raise RuntimeError("fail open")

    service = EmailOtpService(
        AuthFnConfig(
            database=db,
            namespace="authfn",
            hooks=AuthFnHooks(
                beforeChallengeSend=before_send,
                afterChallengeSend=after_send,
            ),
        ),
        EmailOtpPluginConfig(
            delivery=delivery,
            code_generator=lambda: "731942",
            now=clock.now,
        ),
    )

    sent = await service.send_challenge("verify-email", "ada@example.com")
    assert sent["challenge"]["email"] == "transformed@example.com"
    assert sent["challenge"]["deliveryMetadata"] == {"source": "hook", "channel": "email"}
