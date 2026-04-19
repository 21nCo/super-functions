"""Tests for authfn."""

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

from authfn import ApiKeyCreate, AuthFnConfig, create_authfn
from authfn.types import (
    ApiKeyRevokedError,
    ExpiredCredentialsError,
    InvalidCredentialsError,
    OrderByClause,
    WhereClause,
)


class MockDatabaseAdapter:
    """Mock database adapter for testing."""

    def __init__(self):
        self._storage: Dict[str, List[Dict[str, Any]]] = {
            "api_keys": [],
            "sessions": [],
        }

    async def find_one(
        self,
        model: str,
        where: List[WhereClause],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        """Find a single record."""
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if isinstance(clause, dict):
                    operator = clause["operator"]
                    field = clause["field"]
                    value = clause["value"]
                else:
                    operator = clause.operator
                    field = clause.field
                    value = clause.value
                if operator == "eq":
                    if item.get(field) != value:
                        match = False
                        break
            if match:
                return item
        return None

    async def find_many(
        self,
        model: str,
        where: List[WhereClause],
        order_by: Optional[List[OrderByClause]],
        namespace: str,
    ) -> List[Dict[str, Any]]:
        """Find multiple records."""
        results = []
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if isinstance(clause, dict):
                    operator = clause["operator"]
                    field = clause["field"]
                    value = clause["value"]
                else:
                    operator = clause.operator
                    field = clause.field
                    value = clause.value
                if operator == "eq":
                    if item.get(field) != value:
                        match = False
                        break
                elif operator == "contains":
                    field_value = item.get(field)
                    if not isinstance(field_value, list) or value not in field_value:
                        match = False
                        break
            if match:
                results.append(item)
        return results

    async def create(
        self,
        model: str,
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Create a new record."""
        if model not in self._storage:
            self._storage[model] = []
        self._storage[model].append(data.copy())

    async def update(
        self,
        model: str,
        where: List[WhereClause],
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Update records."""
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if isinstance(clause, dict):
                    operator = clause["operator"]
                    field = clause["field"]
                    value = clause["value"]
                else:
                    operator = clause.operator
                    field = clause.field
                    value = clause.value
                if operator == "eq":
                    if item.get(field) != value:
                        match = False
                        break
            if match:
                item.update(data)


class MockRequest:
    """Mock request for testing."""

    def __init__(self, headers: Dict[str, str]):
        self._headers = headers

    @property
    def headers(self) -> Dict[str, str]:
        return self._headers


@pytest.fixture
def db_adapter():
    """Create a mock database adapter."""
    return MockDatabaseAdapter()


@pytest.fixture
async def auth(db_adapter):
    """Create an authfn instance."""
    return create_authfn(
        AuthFnConfig(
            database=db_adapter,
            namespace="authfn",
        )
    )


@pytest.mark.asyncio
async def test_create_api_key(auth):
    """Test creating an API key."""
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1", "resource-2"],
            scopes=["read", "write"],
        )
    )

    assert result.id.startswith("key_")
    assert result.key.startswith("ak_")
    assert len(result.key) > 10


@pytest.mark.asyncio
async def test_authenticate_valid_key(auth):
    """Test authenticating with a valid API key."""
    # Create a key
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1"],
        )
    )

    # Authenticate with the key
    request = MockRequest({"Authorization": f"Bearer {result.key}"})
    session = await auth.provider.authenticate(request)

    assert session is not None
    assert session.actor_type == "api-key"
    assert session.resource_ids == ["resource-1"]
    assert session.type == "api-key"


@pytest.mark.asyncio
async def test_authenticate_invalid_key(auth):
    """Test authenticating with an invalid API key."""
    request = MockRequest({"Authorization": "Bearer invalid_key"})

    with pytest.raises(InvalidCredentialsError):
        await auth.provider.authenticate(request)


@pytest.mark.asyncio
async def test_authenticate_no_header(auth):
    """Test authenticating without authorization header."""
    request = MockRequest({})
    session = await auth.provider.authenticate(request)

    assert session is None


@pytest.mark.asyncio
async def test_authenticate_revoked_key(auth):
    """Test authenticating with a revoked key."""
    # Create and revoke a key
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1"],
        )
    )

    await auth.revoke_key(result.id)

    # Try to authenticate
    request = MockRequest({"Authorization": f"Bearer {result.key}"})

    with pytest.raises(ApiKeyRevokedError):
        await auth.provider.authenticate(request)


@pytest.mark.asyncio
async def test_authenticate_expired_key(auth, db_adapter):
    """Test authenticating with an expired key."""
    # Create a key that's already expired
    expired_at = datetime.utcnow() - timedelta(days=1)

    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1"],
            expiresAt=expired_at,
        )
    )

    # Try to authenticate
    request = MockRequest({"Authorization": f"Bearer {result.key}"})

    with pytest.raises(ExpiredCredentialsError):
        await auth.provider.authenticate(request)


@pytest.mark.asyncio
async def test_authorize(auth):
    """Test authorizing resource access."""
    # Create a key
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1", "resource-2"],
        )
    )

    # Authenticate
    request = MockRequest({"Authorization": f"Bearer {result.key}"})
    session = await auth.provider.authenticate(request)

    # Test authorization
    assert await auth.provider.authorize(session, "resource-1") is True
    assert await auth.provider.authorize(session, "resource-2") is True
    assert await auth.provider.authorize(session, "resource-3") is False


@pytest.mark.asyncio
async def test_get_key(auth):
    """Test getting an API key by ID."""
    # Create a key
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1"],
        )
    )

    # Get the key
    key = await auth.get_key(result.id)

    assert key is not None
    assert key.id == result.id
    assert key.name == "Test Key"
    assert key.resource_ids == ["resource-1"]
    # Key should be sanitized (no secret key)
    assert not hasattr(key, "key")


@pytest.mark.asyncio
async def test_auth_exposes_router_alias(auth):
    """Test the instance exposes the canonical router alias."""
    assert auth.router == auth.get_routes()


@pytest.mark.asyncio
async def test_list_keys(auth):
    """Test listing API keys."""
    # Create multiple keys
    await auth.create_key(
        ApiKeyCreate(name="Key 1", resourceIds=["resource-1"])
    )
    await auth.create_key(
        ApiKeyCreate(name="Key 2", resourceIds=["resource-2"])
    )
    await auth.create_key(
        ApiKeyCreate(name="Key 3", resourceIds=["resource-1", "resource-2"])
    )

    # List all keys
    all_keys = await auth.list_keys()
    assert len(all_keys) == 3

    # List keys for specific resource
    resource1_keys = await auth.list_keys(filters={"resourceId": "resource-1"})
    assert len(resource1_keys) == 2


@pytest.mark.asyncio
async def test_revoke_key(auth):
    """Test revoking an API key."""
    # Create a key
    result = await auth.create_key(
        ApiKeyCreate(
            name="Test Key",
            resourceIds=["resource-1"],
        )
    )

    # Revoke it
    await auth.revoke_key(result.id)

    # Get the key and check it's revoked
    key = await auth.get_key(result.id)
    assert key is not None
    assert key.revoked_at is not None
