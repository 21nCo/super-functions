from __future__ import annotations

import sys

import pytest

from apifn import ApifnConfig, introspect_fastapi


@pytest.mark.skipif(sys.version_info < (3, 10), reason="FastAPI adapter vector is defined for Python 3.10+")
def test_tv_py_001_fastapi_introspection() -> None:
    fastapi = pytest.importorskip("fastapi")
    FastAPI = fastapi.FastAPI
    app = FastAPI()

    @app.get("/users")
    async def list_users() -> list[dict[str, str]]:
        return []

    spec = introspect_fastapi(app, ApifnConfig(title="Test", version="1.0.0"))

    assert spec["openapi"] == "3.1.0"
    assert "/users" in spec["paths"]
    assert "get" in spec["paths"]["/users"]
    assert spec["x-apifn-generated-by"] == "apifn-python"
