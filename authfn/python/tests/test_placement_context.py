"""Placement-bound auth context tests."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
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
    PlacementContextInvalidError,
    PlacementMovingError,
    RegionNotFoundError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
    create_placement_context_issuer,
)
from authfn.http import issue_session
from authfn.plugins.gateway_routing import (
    IdentityPlacement,
    InMemoryIdentityPlacementDirectory,
    RoutingKeyring,
    RoutingSigningKey,
)

from .support import InMemoryDatabaseAdapter, TestRequest

SUBJECT_SECRET = "placement-subject-secret-with-enough-entropy"
KEYRING = RoutingKeyring(
    active=RoutingSigningKey(
        key_id="context-2026-09",
        secret="test-context-secret-with-enough-entropy",
    )
)


@pytest.mark.asyncio
async def test_derives_opaque_context_from_valid_session() -> None:
    issuer, request, user = await _setup()
    context = await issuer.derive(request)
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
    issuer, request, _user = await _setup(
        extra_headers={
            "x-authfn-routing-region": "eu-west-1",
            "x-authfn-routing-epoch": "99",
        }
    )
    context = await issuer.derive(request)
    assert context.home_region == "us-east-1"
    assert context.placement_epoch == 4


@pytest.mark.asyncio
async def test_fails_closed_for_unauthenticated_and_revoked_sessions() -> None:
    issuer, request, _user = await _setup()
    with pytest.raises(UnauthorizedError):
        await issuer.derive(TestRequest("GET", "https://account.example.com/auth/session"))

    record_id = request.headers["x-session-id"]
    await issuer._config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": record_id}],
        data={"revokedAt": datetime.now(timezone.utc)},
        namespace="authfn",
    )
    with pytest.raises(SessionRevokedError):
        await issuer.derive(request)


@pytest.mark.asyncio
async def test_fails_closed_for_moving_and_missing_placement() -> None:
    issuer, request, _user = await _setup(
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
        await issuer.derive(request)

    missing_issuer, missing_request, _missing_user = await _setup(skip_placement=True)
    with pytest.raises(RegionNotFoundError):
        await missing_issuer.derive(missing_request)


@pytest.mark.asyncio
async def test_signed_private_consumer_and_in_process_ticket_exchange() -> None:
    issuer, request, _user = await _setup()
    issued = await issuer.issue_signed(request)
    verified = issuer.verify_signed(issued["assertion"])
    assert verified.home_region == "us-east-1"
    assert verified.subject == issued["context"].subject
    with pytest.raises(ValidationError):
        await issuer.derive(request, audience="other-service")
    with pytest.raises(PlacementContextInvalidError):
        issuer.verify_signed(issued["assertion"], audience="other-service")

    ticket = await issuer.with_context(
        request,
        lambda context: {
            "regionId": context.home_region,
            "epoch": context.placement_epoch,
            "subject": context.subject,
        },
    )
    assert ticket["regionId"] == "us-east-1"
    assert "cell://" not in str(ticket)


async def _setup(
    *,
    extra_headers: Optional[Dict[str, str]] = None,
    placement: Optional[IdentityPlacement] = None,
    identity_key: Optional[str] = None,
    skip_placement: bool = False,
) -> tuple[Any, TestRequest, Dict[str, Any]]:
    config = AuthFnConfig.model_validate(
        {
            "database": InMemoryDatabaseAdapter(),
            "namespace": "authfn",
            "plugins": [],
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
    directory = InMemoryIdentityPlacementDirectory(records)
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
        public_authority="https://account.example.com",
        placement_directory=directory,
        identity_key_for_user_id=lambda user_id: identity_key or f"person:{user_id}",
        keyring=KEYRING,
    )
    return issuer, request, user
