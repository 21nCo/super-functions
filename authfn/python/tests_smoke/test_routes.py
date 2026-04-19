from __future__ import annotations

from typing import Any

from authfn import AuthFnConfig, authfn_password_plugin, create_authfn_routes


class InMemoryDatabaseAdapter:
    async def find_one(self, *args: Any, **kwargs: Any) -> None:
        return None

    async def find_many(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        return []

    async def create(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return dict(kwargs.get("data", {}))

    async def update(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return dict(kwargs.get("data", {}))

    async def delete(self, *args: Any, **kwargs: Any) -> None:
        return None


def test_route_generation_smoke() -> None:
    routes = create_authfn_routes(
        AuthFnConfig.model_validate(
            {
                "database": InMemoryDatabaseAdapter(),
                "plugins": [authfn_password_plugin()],
            }
        )
    )

    paths = {(route.method.value, route.path) for route in routes}
    assert ("POST", "/auth/sign-up/password") in paths
    assert ("POST", "/auth/sign-in/password") in paths
    assert ("GET", "/auth/session") in paths
