from __future__ import annotations

from apifn import diff_openapi


def test_tv_py_005_diff_classification() -> None:
    before = {
        "openapi": "3.1.0",
        "info": {"title": "API", "version": "1.0.0"},
        "paths": {
            "/users": {
                "get": {
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }

    after = {
        "openapi": "3.1.0",
        "info": {"title": "API", "version": "1.1.0"},
        "paths": {
            "/users": {
                "get": {
                    "parameters": [
                        {"name": "tenant", "in": "query", "required": True, "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "ok"}},
                }
            },
            "/orders": {
                "get": {
                    "responses": {"200": {"description": "ok"}},
                }
            },
        },
    }

    result = diff_openapi(before, after)

    assert result["hasBreaking"] is True
    assert result["summary"]["breaking"] == 1
    assert result["summary"]["nonBreaking"] == 1
    types = {entry["type"] for entry in result["entries"]}
    assert "required_param_added" in types
    assert "endpoint_added" in types
