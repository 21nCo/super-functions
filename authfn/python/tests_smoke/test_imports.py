from __future__ import annotations

from typing import Any

from authfn import AuthFnConfig, authfn_password_plugin, create_authfn, get_schema


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


def test_import_and_schema_smoke() -> None:
    config = AuthFnConfig.model_validate(
        {
            "database": InMemoryDatabaseAdapter(),
            "plugins": [authfn_password_plugin()],
        }
    )

    auth = create_authfn(config)
    schema = get_schema(config)

    assert auth.provider is not None
    assert [table["modelName"] for table in schema["schemas"]] == [
        "users",
        "sessions",
        "password_credentials",
    ]
