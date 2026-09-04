"""Placement-bound auth context tests."""

from __future__ import annotations

import base64
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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

from authfn import (
    AuthFnConfig,
    ConfigError,
    IdentityPlacement,
    InMemoryIdentityPlacementDirectory,
    PlacementContextInvalidError,
    PlacementDirectoryUnavailableError,
    PlacementMovingError,
    RegionNotFoundError,
    RoutingKeyring,
    RoutingSigningKey,
    SessionExpiredError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
    create_placement_context_issuer,
    create_placement_context_verifier,
)
from authfn.http import _hash_secret, issue_session, revoke_session_by_id
from authfn.observability import resolve_request_id
from authfn.plugins.placement_context import _isoformat, _normalize_authority

from .support import InMemoryDatabaseAdapter, TestRequest


@dataclass
class _Setup:
    issuer: Any
    request: TestRequest
    user: Dict[str, Any]
    issued: Dict[str, Any]
    config: AuthFnConfig
    directory: Any

SUBJECT_SECRET = "placement-subject-secret-with-enough-entropy"
KEYRING = RoutingKeyring(
    active=RoutingSigningKey(
        key_id="context-2026-09",
        secret="test-context-secret-with-enough-entropy",
    )
)


@pytest.mark.asyncio
async def test_derives_opaque_context_from_valid_session() -> None:
    setup = await _setup()
    context = await setup.issuer.derive(setup.request)
    user = setup.user
    assert user["id"] not in context.subject
    assert "ada@example.com" not in context.subject
    assert context.home_region == "us-east-1"
    assert context.placement_epoch == 4
    assert context.issuer == "https://account.example.com"
    assert context.audience == "nucleum-datafn"
    assert context.user_id is None
    assert "ada@example.com" not in str(context)
    assert "cell://" not in str(context)


@pytest.mark.asyncio
async def test_ignores_client_supplied_routing_headers() -> None:
    setup = await _setup(
        extra_headers={
            "x-authfn-routing-region": "eu-west-1",
            "x-authfn-routing-epoch": "99",
        }
    )
    context = await setup.issuer.derive(setup.request)
    assert context.home_region == "us-east-1"
    assert context.placement_epoch == 4


@pytest.mark.asyncio
async def test_fails_closed_for_unauthenticated_revoked_expired_and_deleted() -> None:
    setup = await _setup()
    unauthenticated = TestRequest("GET", "https://account.example.com/auth/session")
    with pytest.raises(UnauthorizedError):
        await setup.issuer.derive(unauthenticated)

    await revoke_session_by_id(setup.config, setup.issued["record"]["id"], user_id=setup.user["id"])
    with pytest.raises(SessionRevokedError):
        await setup.issuer.derive(setup.request)

    expired = await _setup()
    await expired.config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": expired.issued["record"]["id"]}],
        data={"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)},
        namespace="authfn",
    )
    with pytest.raises(SessionExpiredError):
        await expired.issuer.derive(expired.request)

    deleted = await _setup()
    await deleted.config.database.delete_many(
        model="users",
        where=[{"field": "id", "operator": "eq", "value": deleted.user["id"]}],
        namespace="authfn",
    )
    with pytest.raises(UnauthorizedError):
        await deleted.issuer.derive(deleted.request)


@pytest.mark.asyncio
async def test_fails_closed_for_moving_deleting_tombstoned_missing_and_unavailable() -> None:
    moving = await _setup(
        placement=IdentityPlacement(
            identity_key="person:ada",
            region_id="us-east-1",
            epoch=5,
            state="moving",
            updated_at="2026-09-04T00:00:00.000Z",
        ),
        identity_key="person:ada",
    )
    with pytest.raises(PlacementMovingError):
        await moving.issuer.derive(moving.request)

    deleting = await _setup(
        placement=IdentityPlacement(
            identity_key="person:ada",
            region_id="us-east-1",
            epoch=5,
            state="deleting",
            updated_at="2026-09-04T00:00:00.000Z",
        ),
        identity_key="person:ada",
    )
    with pytest.raises(PlacementMovingError):
        await deleting.issuer.derive(deleting.request)

    tombstoned = await _setup()
    await tombstoned.directory.compare_and_set(
        identity_key=f"person:{tombstoned.user['id']}",
        expected_epoch=4,
        expected_state="active",
        placement=IdentityPlacement(
            identity_key=f"person:{tombstoned.user['id']}",
            region_id="us-east-1",
            epoch=4,
            state="tombstoned",
            updated_at="2026-09-04T00:00:00.000Z",
        ),
    )
    with pytest.raises(RegionNotFoundError):
        await tombstoned.issuer.derive(tombstoned.request)

    missing = await _setup(skip_placement=True)
    with pytest.raises(RegionNotFoundError):
        await missing.issuer.derive(missing.request)

    class DownDirectory:
        async def get(self, _identity_key: str) -> None:
            raise RuntimeError("directory down")

        async def put_if_absent(self, _placement: IdentityPlacement) -> Dict[str, Any]:
            raise RuntimeError("directory down")

        async def compare_and_set(self, **_kwargs: Any) -> Dict[str, Any]:
            raise RuntimeError("directory down")

    down = await _setup(directory=DownDirectory())
    with pytest.raises(PlacementDirectoryUnavailableError):
        await down.issuer.derive(down.request)


@pytest.mark.asyncio
async def test_signed_private_consumer_and_in_process_ticket_exchange() -> None:
    setup = await _setup()
    issued = await setup.issuer.issue_signed(setup.request)
    remote = create_placement_context_verifier(
        audiences=["nucleum-datafn"],
        public_authority="https://account.example.com",
        keyring=KEYRING,
        config=setup.config,
    )
    verified = remote.verify_signed(issued["assertion"])
    assert verified.home_region == "us-east-1"
    assert verified.subject == issued["context"].subject
    encoded = issued["assertion"].split(".", 1)[0]
    padding = "=" * ((4 - len(encoded) % 4) % 4)
    payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
    assert "userId" not in payload
    assert "scopes" not in payload
    with pytest.raises(ValidationError):
        await setup.issuer.derive(setup.request, audience="other-service")
    with pytest.raises(PlacementContextInvalidError):
        remote.verify_signed(issued["assertion"], audience="other-service")

    ticket = await setup.issuer.with_context(
        setup.request,
        lambda context: {
            "regionId": context.home_region,
            "epoch": context.placement_epoch,
            "subject": context.subject,
        },
    )
    assert ticket["regionId"] == "us-east-1"
    assert "cell://" not in str(ticket)


@pytest.mark.asyncio
async def test_keeps_issued_grants_after_revoke_and_uses_new_epoch_after_move() -> None:
    setup = await _setup()
    signed = await setup.issuer.issue_signed(setup.request)
    await revoke_session_by_id(setup.config, setup.issued["record"]["id"], user_id=setup.user["id"])
    with pytest.raises(SessionRevokedError):
        await setup.issuer.derive(setup.request)
    assert setup.issuer.verify_signed(signed["assertion"]).session_binding == signed["context"].session_binding

    moved = await _setup()
    first = await moved.issuer.derive(moved.request)
    await moved.directory.compare_and_set(
        identity_key=f"person:{moved.user['id']}",
        expected_epoch=4,
        expected_state="active",
        placement=IdentityPlacement(
            identity_key=f"person:{moved.user['id']}",
            region_id="eu-west-1",
            epoch=6,
            state="active",
            previous_region_id="us-east-1",
            updated_at="2026-09-04T13:00:00.000Z",
        ),
    )
    next_context = await moved.issuer.derive(moved.request)
    assert next_context.home_region == "eu-west-1"
    assert next_context.placement_epoch == 6
    assert next_context.subject == first.subject


@pytest.mark.asyncio
async def test_falls_back_to_authorization_when_cookie_is_stale() -> None:
    setup = await _setup()
    fresh = await issue_session(
        setup.config,
        TestRequest("GET", "https://account.example.com/auth/session"),
        user=setup.user,
        methods=["password"],
    )
    await revoke_session_by_id(setup.config, setup.issued["record"]["id"], user_id=setup.user["id"])
    with pytest.raises(SessionRevokedError):
        await setup.issuer.derive(setup.request)

    mixed = TestRequest(
        "GET",
        "https://account.example.com/auth/session",
        headers={
            "cookie": setup.request.headers["cookie"],
            "authorization": f"Bearer {fresh['sessionToken']}",
        },
    )
    context = await setup.issuer.derive(mixed)
    bearer_only = await setup.issuer.derive(
        TestRequest(
            "GET",
            "https://account.example.com/auth/session",
            headers={"authorization": f"Bearer {fresh['sessionToken']}"},
        )
    )
    assert context.home_region == "us-east-1"
    assert context.session_binding == bearer_only.session_binding


@pytest.mark.asyncio
async def test_uses_stored_authentication_time_for_cookie_and_bearer() -> None:
    setup = await _setup()
    authenticated_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    await setup.config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": setup.issued["record"]["id"]}],
        data={"lastAuthenticatedAt": authenticated_at, "updatedAt": authenticated_at},
        namespace="authfn",
    )
    cookie_context = await setup.issuer.derive(setup.request)
    bearer_context = await setup.issuer.derive(
        TestRequest(
            "GET",
            "https://account.example.com/auth/session",
            headers={"authorization": f"Bearer {setup.issued['sessionToken']}"},
        )
    )
    again = await setup.issuer.derive(setup.request)
    expected = "2026-09-01T00:00:00.000Z"
    assert cookie_context.authenticated_at == expected
    assert bearer_context.authenticated_at == expected
    assert again.authenticated_at == expected
    assert again.session_version == cookie_context.session_version


@pytest.mark.asyncio
async def test_emits_configured_observability_events() -> None:
    events: List[Any] = []
    setup = await _setup(on_event=events.append)
    await setup.issuer.derive(setup.request)
    types = [getattr(event, "type", None) or event.get("type") for event in events]
    assert "authfn.placement_context.issued" in types
    issued = next(
        event
        for event in events
        if (getattr(event, "type", None) or event.get("type")) == "authfn.placement_context.issued"
    )
    issued_metadata = getattr(issued, "metadata", None) or issued.get("metadata")
    assert issued_metadata["actorType"] == "user"
    with pytest.raises(ValidationError):
        await setup.issuer.derive(setup.request, audience="other-service")
    types = [getattr(event, "type", None) or event.get("type") for event in events]
    assert "authfn.placement_context.rejected" in types
    signed = await setup.issuer.issue_signed(setup.request)
    with pytest.raises(PlacementContextInvalidError):
        setup.issuer.verify_signed(signed["assertion"], audience="other-service")
    failed = [
        event
        for event in events
        if (getattr(event, "type", None) or event.get("type")) == "authfn.placement_context.verification_failed"
    ]
    assert failed
    metadata = getattr(failed[-1], "metadata", None) or failed[-1].get("metadata")
    assert metadata.get("errorType")
    assert metadata.get("audience") == "other-service"


@pytest.mark.asyncio
async def test_normalizes_default_https_port_like_typescript_origin() -> None:
    setup = await _setup(public_authority="https://account.example.com:443")
    context = await setup.issuer.derive(setup.request)
    assert context.issuer == "https://account.example.com"


@pytest.mark.asyncio
async def test_reuses_original_request_correlation_id() -> None:
    setup = await _setup()
    context = await setup.issuer.derive(setup.request)
    assert context.request_id == resolve_request_id(setup.request)


@pytest.mark.asyncio
async def test_accepts_lowercase_authorization_scheme() -> None:
    setup = await _setup()
    await setup.config.database.create(
        model="api_keys",
        data={
            "id": "key_lower",
            "secretHash": _hash_secret("secret_lower"),
            "userId": setup.user["id"],
            "name": "lower",
            "createdAt": datetime(2026, 9, 1, tzinfo=timezone.utc),
            "updatedAt": datetime(2026, 9, 1, tzinfo=timezone.utc),
        },
        namespace="authfn",
    )
    request = TestRequest(
        "GET",
        "https://account.example.com/auth/session",
        headers={"authorization": "bearer secret_lower"},
    )
    context = await setup.issuer.derive(request)
    assert context.actor_type == "api-key"
    assert context.home_region == "us-east-1"


@pytest.mark.asyncio
async def test_awaits_async_identity_key_resolver() -> None:
    async def resolve(user_id: str) -> str:
        return f"person:{user_id}"

    setup = await _setup(identity_key_for_user_id=resolve)
    context = await setup.issuer.derive(setup.request)
    assert context.home_region == "us-east-1"
    assert context.placement_epoch == 4


@pytest.mark.asyncio
async def test_rejects_explicitly_empty_audience() -> None:
    setup = await _setup()
    with pytest.raises(ValidationError):
        await setup.issuer.derive(setup.request, audience="")
    signed = await setup.issuer.issue_signed(setup.request)
    with pytest.raises(PlacementContextInvalidError):
        setup.issuer.verify_signed(signed["assertion"], audience="")


@pytest.mark.asyncio
async def test_canonicalizes_idn_authority_to_punycode() -> None:
    setup = await _setup(public_authority="https://münich.example")
    context = await setup.issuer.derive(setup.request)
    assert context.issuer == "https://xn--mnich-kva.example"
    assert _normalize_authority("https://faß.de") == "https://xn--fa-hia.de"
    assert _normalize_authority("https://xn--fa-hia.de") == "https://xn--fa-hia.de"


def test_canonicalizes_timestamps_like_javascript_to_iso_string() -> None:
    assert _isoformat(datetime(2026, 8, 1, tzinfo=timezone.utc)) == "2026-08-01T00:00:00.000Z"
    assert _isoformat("2026-08-01T00:00:00Z") == "2026-08-01T00:00:00.000Z"
    assert _isoformat(datetime(2026, 8, 1, 0, 0, 0, 123000, tzinfo=timezone.utc)) == "2026-08-01T00:00:00.123Z"


@pytest.mark.asyncio
async def test_evaluates_cookie_and_bearer_expiry_against_issuer_clock() -> None:
    expires_at = datetime.now(timezone.utc) - timedelta(seconds=60)
    issuer_now = (expires_at - timedelta(seconds=60)).timestamp()
    setup = await _setup(clock=lambda: issuer_now)
    await setup.config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": setup.issued["record"]["id"]}],
        data={"expiresAt": expires_at},
        namespace="authfn",
    )
    cookie_context = await setup.issuer.derive(setup.request)
    bearer_context = await setup.issuer.derive(
        TestRequest(
            "GET",
            "https://account.example.com/auth/session",
            headers={"authorization": f"Bearer {setup.issued['sessionToken']}"},
        )
    )
    assert cookie_context.home_region == "us-east-1"
    assert bearer_context.session_binding == cookie_context.session_binding


@pytest.mark.asyncio
async def test_keeps_signed_request_id_on_post_signature_verification_failure() -> None:
    events: List[Any] = []
    setup = await _setup(on_event=events.append)
    signed = await setup.issuer.issue_signed(setup.request)
    with pytest.raises(PlacementContextInvalidError):
        setup.issuer.verify_signed(signed["assertion"], audience="other-service")
    failed = [
        event
        for event in events
        if (getattr(event, "type", None) or event.get("type")) == "authfn.placement_context.verification_failed"
    ]
    assert failed
    assert (getattr(failed[-1], "requestId", None) or failed[-1].get("requestId")) == signed["context"].request_id


def test_rejects_fractional_and_boolean_ttl() -> None:
    config = AuthFnConfig.model_validate(
        {"database": InMemoryDatabaseAdapter(), "namespace": "authfn", "plugins": []}
    )
    directory = InMemoryIdentityPlacementDirectory()
    kwargs = {
        "config": config,
        "subject_secret": SUBJECT_SECRET,
        "audiences": ["nucleum-datafn"],
        "public_authority": "https://account.example.com",
        "placement_directory": directory,
        "identity_key_for_user_id": lambda user_id: f"person:{user_id}",
    }
    with pytest.raises(ConfigError):
        create_placement_context_issuer(**kwargs, ttl_seconds=1.5)
    with pytest.raises(ConfigError):
        create_placement_context_issuer(**kwargs, ttl_seconds=True)
    with pytest.raises(ConfigError):
        create_placement_context_issuer(**kwargs, clock_skew_seconds=2.5)


async def _setup(
    *,
    extra_headers: Optional[Dict[str, str]] = None,
    placement: Optional[IdentityPlacement] = None,
    identity_key: Optional[str] = None,
    identity_key_for_user_id: Optional[Any] = None,
    skip_placement: bool = False,
    on_event: Optional[Any] = None,
    public_authority: str = "https://account.example.com",
    directory: Optional[Any] = None,
    clock: Optional[Any] = None,
) -> _Setup:
    config = AuthFnConfig.model_validate(
        {
            "database": InMemoryDatabaseAdapter(),
            "namespace": "authfn",
            "plugins": [],
            "observability": {"emit": on_event} if on_event is not None else None,
        }
    )
    user = {
        "id": "user_ada",
        "primaryEmail": "ada@example.com",
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    await config.database.create(model="users", data=user, namespace="authfn")
    resolved_key = identity_key or f"person:{user['id']}"
    records: List[IdentityPlacement] = []
    if not skip_placement:
        records.append(
            placement
            or IdentityPlacement(
                identity_key=resolved_key,
                region_id="us-east-1",
                epoch=4,
                state="active",
                updated_at="2026-09-04T00:00:00.000Z",
            )
        )
    resolved_directory = directory or InMemoryIdentityPlacementDirectory(records)
    issued = await issue_session(
        config,
        TestRequest("GET", "https://account.example.com/auth/session"),
        user=user,
        methods=["password"],
    )
    cookie_header = "; ".join(
        f"{cookie.name}={cookie.value}" for cookie in issued["cookies"]
    )
    request = TestRequest(
        "GET",
        "https://account.example.com/auth/session",
        headers={
            "cookie": cookie_header,
            "x-session-id": issued["record"]["id"],
            **(extra_headers or {}),
        },
    )
    issuer = create_placement_context_issuer(
        config=config,
        subject_secret=SUBJECT_SECRET,
        audiences=["nucleum-datafn"],
        public_authority=public_authority,
        placement_directory=resolved_directory,
        identity_key_for_user_id=identity_key_for_user_id
        or (lambda user_id: identity_key or f"person:{user_id}"),
        keyring=KEYRING,
        on_event=on_event,
        **({"clock": clock} if clock is not None else {}),
    )
    return _Setup(
        issuer=issuer,
        request=request,
        user=user,
        issued=issued,
        config=config,
        directory=resolved_directory,
    )
