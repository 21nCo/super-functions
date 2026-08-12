from __future__ import annotations

import re
from typing import Any

from .config import ApifnConfig
from .openapi import augment_openapi

_FLASK_PARAM_RE = re.compile(r"<(?:(?P<converter>[^:>]+):)?(?P<name>[^>]+)>")


def _flask_path_to_openapi(path: str) -> tuple[str, list[dict[str, Any]]]:
    parameters: list[dict[str, Any]] = []

    def replace(match: re.Match[str]) -> str:
        name = match.group("name")
        converter = (match.group("converter") or "string").lower()
        schema_type = "integer" if converter in {"int", "integer"} else "string"
        parameters.append(
            {
                "name": name,
                "in": "path",
                "required": True,
                "schema": {"type": schema_type},
            }
        )
        return "{" + name + "}"

    return _FLASK_PARAM_RE.sub(replace, path), parameters


def introspect_flask(app: Any, config: ApifnConfig) -> dict[str, Any]:
    """Build a minimal OpenAPI spec from Flask URL rules, then augment."""
    paths: dict[str, Any] = {}

    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue

        methods = sorted(m for m in rule.methods if m not in {"HEAD", "OPTIONS"})
        if not methods:
            continue

        openapi_path, parameters = _flask_path_to_openapi(rule.rule)
        path_item = paths.setdefault(openapi_path, {})

        for method in methods:
            operation: dict[str, Any] = {
                "operationId": f"{rule.endpoint}_{method.lower()}",
                "responses": {
                    "200": {
                        "description": "Success",
                        "content": {
                            "application/json": {
                                "schema": {"type": "object"}
                            }
                        },
                    }
                },
            }
            if parameters:
                operation["parameters"] = parameters
            path_item[method.lower()] = operation

    doc = {
        "openapi": "3.1.0",
        "info": {
            "title": config.title,
            "version": config.version,
        },
        "paths": paths,
    }
    return augment_openapi(doc, config)
