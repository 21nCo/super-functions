"""Deterministic OpenAPI generation for shared superfunctions HTTP routes."""

from __future__ import annotations

from typing import Any

from .types import OpenApiRouteMeta, Route, get_route_openapi_meta

_METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head"]


class OpenApiGenerationError(Exception):
    """Raised when route metadata is incomplete for OpenAPI generation."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "OPENAPI_META_INCOMPLETE",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


def generate_openapi_document(title: str, version: str, routes: list[Route]) -> dict[str, Any]:
    """Generate a deterministic OpenAPI document from shared route metadata."""

    path_entries: dict[str, dict[str, dict[str, Any]]] = {}
    operation_sources: dict[tuple[str, str], str] = {}

    for route in routes:
        meta = get_route_openapi_meta(route)
        if meta is None or meta.include is False:
            continue

        if not meta.operation_id:
            raise OpenApiGenerationError(
                "route OpenAPI metadata requires operationId",
                details={"method": route.method.value, "path": route.path},
            )

        normalized_path = _normalize_openapi_path(route.path)
        normalized_method = route.method.value.lower()
        operations = path_entries.setdefault(normalized_path, {})
        collision_key = (normalized_path, normalized_method)

        if collision_key in operation_sources:
            raise OpenApiGenerationError(
                "duplicate normalized OpenAPI operation",
                code="OPENAPI_ROUTE_COLLISION",
                details={
                    "method": route.method.value,
                    "path": normalized_path,
                    "firstRoutePath": operation_sources[collision_key],
                    "duplicateRoutePath": route.path,
                },
            )

        operation_sources[collision_key] = route.path
        operations[normalized_method] = _build_operation(meta)

    return {
        "openapi": "3.1.0",
        "info": {
            "title": title,
            "version": version,
        },
        "paths": {
            path: {
                method: operations[method]
                for method in sorted(operations.keys(), key=_method_order)
            }
            for path, operations in sorted(path_entries.items(), key=lambda item: item[0])
        },
    }


def _build_operation(meta: OpenApiRouteMeta) -> dict[str, Any]:
    operation: dict[str, Any] = {"operationId": meta.operation_id}

    if meta.summary:
        operation["summary"] = meta.summary

    if meta.description:
        operation["description"] = meta.description

    if meta.tags:
        operation["tags"] = sorted(meta.tags)

    if meta.request_body_schema:
        operation["requestBody"] = {
            "required": True,
            "content": {
                "application/json": {
                    "schema": _sort_mapping(meta.request_body_schema),
                }
            },
        }

    operation["responses"] = _build_responses(meta.response_schemas)
    return operation


def _build_responses(response_schemas: dict[str, dict[str, Any]] | None) -> dict[str, dict[str, Any]]:
    if not response_schemas:
        return {"200": {"description": "Success"}}

    return {
        status_code: {
            "description": f"HTTP {status_code} response",
            "content": {
                "application/json": {
                    "schema": _sort_mapping(schema),
                }
            },
        }
        for status_code, schema in sorted(response_schemas.items(), key=lambda item: item[0])
    }


def _normalize_openapi_path(path: str) -> str:
    segments = []
    for segment in path.split("/"):
        if segment.startswith(":") and len(segment) > 1:
            segments.append(f"{{{segment[1:]}}}")
        else:
            segments.append(segment)
    return "/".join(segments)


def _method_order(method: str) -> int:
    try:
        return _METHOD_ORDER.index(method.lower())
    except ValueError:
        return len(_METHOD_ORDER)


def _sort_mapping(value: dict[str, Any]) -> dict[str, Any]:
    return {key: _sort_value(entry_value) for key, entry_value in sorted(value.items(), key=lambda item: item[0])}


def _sort_value(value: Any) -> Any:
    if isinstance(value, dict):
        return _sort_mapping(value)
    if isinstance(value, list):
        return [_sort_value(item) for item in value]
    return value
