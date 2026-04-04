"""Multi-region plugin tests for authfn Python."""

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

from authfn import (
    AuthFnConfig,
    RegionMismatchError,
    RegionNotFoundError,
)
from authfn.plugins.multi_region import (
    MultiRegionPluginConfig,
    MultiRegionRegionConfig,
    MultiRegionService,
    authfn_multi_region_plugin,
)


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "region_profiles": [],
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


class RuntimeResolver:
    def resolve(self, request: Any) -> Dict[str, Any]:
        origin = request.url.split("/auth", 1)[0]
        return {
            "issuer": origin,
            "baseUrl": origin,
            "cookie": {
                "prefix": "authfn-base",
                "sameSite": "lax",
            },
            "oauth": {
                "google": {
                    "clientId": "base-google-client",
                    "scopes": ["openid", "email"],
                }
            },
        }


class Request:
    def __init__(self, url: str) -> None:
        self.url = url
        self.headers: Dict[str, str] = {}


class Directory:
    def __init__(self) -> None:
        self.register_calls: List[Dict[str, Any]] = []

    async def lookup_by_identifier(self, _input: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None

    async def register_user(self, payload: Dict[str, Any]) -> None:
        self.register_calls.append(payload)


def create_plugin_config(directory: Optional[Directory] = None) -> MultiRegionPluginConfig:
    return MultiRegionPluginConfig(
        regions=[
            MultiRegionRegionConfig(
                region_id="us-east-1",
                authority="https://us.account.example.com",
                hosts=["us.account.example.com"],
                cookie={"prefix": "authfn-us"},
                oauth={"google": {"clientId": "us-google-client", "scopes": ["openid", "email", "profile"]}},
            ),
            MultiRegionRegionConfig(
                region_id="eu-west-1",
                authority="https://eu.account.example.com",
                hosts=["eu.account.example.com"],
                domain=".example.com",
                cookie={"prefix": "authfn-eu", "sameSite": "none"},
                oauth={"google": {"clientId": "eu-google-client", "scopes": ["openid", "email", "profile"]}},
            ),
        ],
        directory=directory,
    )


@pytest.mark.asyncio
async def test_multi_region_plugin_schema_routes_and_service_behaviour() -> None:
    plugin = authfn_multi_region_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )
    assert {table["modelName"] for table in schema} == {"region_profiles"}
    assert {(route["method"], route["path"]) for route in routes} == {
        ("POST", "/regions/lookup"),
        ("GET", "/runtime"),
    }

    db = MockDatabaseAdapter()
    await db.create(
        model="users",
        data={
            "id": "user_1",
            "primaryEmail": "ada@example.com",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        },
        namespace="authfn",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        create_plugin_config(),
    )

    await service.register_user(
        user_id="user_1",
        primary_email="ada@example.com",
        request=Request("https://eu.account.example.com/auth/sign-up/password"),
    )

    runtime = service.resolve_runtime(Request("https://eu.account.example.com/auth/runtime"))
    assert runtime.region_id == "eu-west-1"
    assert runtime.base_url == "https://eu.account.example.com"
    assert runtime.cookie is not None
    assert runtime.cookie.prefix == "authfn-eu"
    assert runtime.cookie.domain == ".example.com"
    assert runtime.cookie.same_site == "none"
    assert runtime.oauth["google"]["clientId"] == "eu-google-client"

    lookup = await service.lookup(
        identifier="ada@example.com",
        request=Request("https://us.account.example.com/auth/regions/lookup"),
    )
    assert lookup == {
        "identifier": "ada@example.com",
        "userId": "user_1",
        "regionId": "eu-west-1",
        "authority": "https://eu.account.example.com",
        "domain": ".example.com",
        "continueLocally": False,
        "redirectTo": "https://eu.account.example.com",
    }

    with pytest.raises(RegionMismatchError) as error:
        await service.ensure_region_alignment(
            user_id="user_1",
            request=Request("https://us.account.example.com/auth/sign-in/password"),
        )
    assert error.value.code == "AUTHFN_REGION_MISMATCH"
    assert error.value.details["redirectTo"] == "https://eu.account.example.com"

    with pytest.raises(RegionNotFoundError) as missing:
        await service.lookup(
            identifier="unknown@example.com",
            request=Request("https://us.account.example.com/auth/regions/lookup"),
        )
    assert missing.value.code == "AUTHFN_REGION_NOT_FOUND"


@pytest.mark.asyncio
async def test_multi_region_registration_updates_local_profile_and_directory() -> None:
    db = MockDatabaseAdapter()
    directory = Directory()
    await db.create(
        model="users",
        data={
            "id": "user_2",
            "primaryEmail": "bea@example.com",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        },
        namespace="authfn",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        create_plugin_config(directory),
    )

    registered = await service.register_user(
        user_id="user_2",
        primary_email="bea@example.com",
        request=Request("https://us.account.example.com/auth/sign-up/password"),
    )
    assert registered["regionId"] == "us-east-1"
    assert registered["authority"] == "https://us.account.example.com"
    assert len(directory.register_calls) == 1
    assert directory.register_calls[0]["userId"] == "user_2"
    assert db.storage["region_profiles"][0]["regionId"] == "us-east-1"
