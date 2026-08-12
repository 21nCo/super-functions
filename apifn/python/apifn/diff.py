from __future__ import annotations

from typing import Any


def _iter_operations(spec: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            method_l = str(method).lower()
            if method_l in {"get", "post", "put", "patch", "delete", "head", "options", "trace"}:
                out[(method_l, path)] = operation or {}
    return out


def _required_params(op: dict[str, Any]) -> set[tuple[str, str]]:
    required: set[tuple[str, str]] = set()
    for p in op.get("parameters") or []:
        if isinstance(p, dict) and p.get("required"):
            required.add((str(p.get("in", "query")), str(p.get("name", ""))))
    return required


def diff_openapi(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_ops = _iter_operations(before)
    after_ops = _iter_operations(after)

    entries: list[dict[str, Any]] = []

    for key in sorted(before_ops.keys() - after_ops.keys()):
        method, path = key
        entries.append(
            {
                "type": "endpoint_removed",
                "level": "breaking",
                "method": method.upper(),
                "path": path,
                "message": f"Endpoint removed: {method.upper()} {path}",
            }
        )

    for key in sorted(before_ops.keys() & after_ops.keys()):
        b = before_ops[key]
        a = after_ops[key]

        added_required = sorted(_required_params(a) - _required_params(b))
        for where, name in added_required:
            method, path = key
            entries.append(
                {
                    "type": "required_param_added",
                    "level": "breaking",
                    "method": method.upper(),
                    "path": path,
                    "message": f"Required parameter added: {where}.{name}",
                }
            )

    for key in sorted(after_ops.keys() - before_ops.keys()):
        method, path = key
        entries.append(
            {
                "type": "endpoint_added",
                "level": "non-breaking",
                "method": method.upper(),
                "path": path,
                "message": f"Endpoint added: {method.upper()} {path}",
            }
        )

    summary = {
        "total": len(entries),
        "breaking": sum(1 for e in entries if e["level"] == "breaking"),
        "nonBreaking": sum(1 for e in entries if e["level"] == "non-breaking"),
    }

    return {
        "entries": entries,
        "summary": summary,
        "hasBreaking": summary["breaking"] > 0,
    }
