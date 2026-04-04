"""API key plugin tests for authfn Python."""

from __future__ import annotations

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

from authfn import ApiKeyRevokedError, AuthFnConfig
from authfn.plugins.api_keys import ApiKeyPluginConfig, ApiKeyService, authfn_api_key_plugin


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {"api_keys": []}

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
        operator = clause["operator"]
        field = clause["field"]
        value = clause["value"]
        if operator == "eq" and row.get(field) != value:
            return False
    return True


class MockRequest:
    def __init__(self, headers: Dict[str, str]) -> None:
        self.headers = headers


@pytest.mark.asyncio
async def test_api_key_plugin_schema_and_routes() -> None:
    plugin = authfn_api_key_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )

    assert schema[0]["modelName"] == "api_keys"
    assert {route["path"] for route in routes} == {"/api-keys", "/api-keys/:keyId"}
    assert {route["method"] for route in routes} == {"POST", "GET", "DELETE"}


@pytest.mark.asyncio
async def test_create_list_authenticate_and_revoke_api_keys() -> None:
    db = MockDatabaseAdapter()
    service = ApiKeyService(
        AuthFnConfig(database=db, namespace="authfn"),
        ApiKeyPluginConfig(now=lambda: datetime(2026, 3, 22, 0, 0, 0)),
    )

    created = await service.create_key(
        user_id="user_1",
        name="server-to-server",
        scopes=["read"],
    )
    assert created["keyId"].startswith("key_")
    assert created["secret"].startswith("ak_")
    assert db.storage["api_keys"][0]["secretHash"] != created["secret"]

    listed = await service.list_keys(user_id="user_1")
    assert listed == [
        {
            "id": created["keyId"],
            "userId": "user_1",
            "name": "server-to-server",
            "scopes": ["read"],
            "metadata": {},
            "expiresAt": None,
            "revokedAt": None,
            "lastUsedAt": None,
            "createdAt": datetime(2026, 3, 22, 0, 0, 0),
            "updatedAt": datetime(2026, 3, 22, 0, 0, 0),
        }
    ]

    authenticated = await service.authenticate(
        MockRequest({"authorization": f"Bearer {created['secret']}"})
    )
    assert authenticated is not None
    assert authenticated.type == "api-key"
    assert authenticated.methods == ["api-key"]

    await service.revoke_key(key_id=created["keyId"], user_id="user_1")
    with pytest.raises(ApiKeyRevokedError):
        await service.authenticate(MockRequest({"authorization": f"Bearer {created['secret']}"}))
