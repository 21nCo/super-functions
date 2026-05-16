from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

import httpx
import yaml


_VAR_RE = re.compile(r"{{\s*([\w.-]+)\s*}}")


def _interpolate(value: str, context: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        return str(context.get(key, match.group(0)))

    return _VAR_RE.sub(repl, value)


def _walk_requests(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        kind = item.get("kind")
        if kind == "request" and item.get("request"):
            out.append(item)
        elif kind == "folder":
            out.extend(_walk_requests(item.get("children") or []))
    return out


def read_collection(directory: str | Path) -> dict[str, Any]:
    root = Path(directory)
    top = root / "opencollection.yml"
    if not top.exists():
        raise FileNotFoundError(f"Missing opencollection.yml in {root}")

    with top.open("r", encoding="utf-8") as f:
        collection = yaml.safe_load(f) or {}

    collection.setdefault("info", {})
    collection.setdefault("items", [])
    collection.setdefault("environments", {})
    return collection


def run_collection(collection: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    env_name = options.get("environment", "default")
    overrides = options.get("overrides") or {}
    timeout = float(options.get("timeout", 30.0))

    envs = collection.get("environments") or {}
    if env_name not in envs:
        raise ValueError(f"Environment '{env_name}' not found")

    env = (envs.get(env_name) or {}).copy()
    variables = (env.get("variables") or {}).copy()
    variables.update(overrides)
    context = {k: str(v) for k, v in variables.items()}

    requests = _walk_requests(collection.get("items") or [])
    started = time.time()

    own_client = False
    client = options.get("client")
    if client is None:
        own_client = True
        client = httpx.Client(timeout=timeout)

    results: list[dict[str, Any]] = []

    try:
        for item in requests:
            req = item["request"]["http"]
            method = req["method"].upper()
            url = _interpolate(req["url"], context)
            headers = {
                h["name"]: _interpolate(h.get("value", ""), context)
                for h in req.get("headers", [])
            }

            body = None
            if req.get("body") and req["body"].get("data") is not None:
                body = _interpolate(str(req["body"]["data"]), context)

            started_req = time.time()
            try:
                resp = client.request(method, url, headers=headers, content=body)
                duration_ms = int((time.time() - started_req) * 1000)
                status = "passed" if resp.status_code < 400 else "failed"
                results.append(
                    {
                        "name": item["name"],
                        "status": status,
                        "duration": duration_ms,
                        "statusCode": resp.status_code,
                        "assertions": [],
                    }
                )
            except Exception as exc:  # pragma: no cover - defensive mapping
                duration_ms = int((time.time() - started_req) * 1000)
                results.append(
                    {
                        "name": item["name"],
                        "status": "error",
                        "duration": duration_ms,
                        "assertions": [],
                        "error": str(exc),
                    }
                )
    finally:
        if own_client:
            client.close()

    duration = int((time.time() - started) * 1000)
    summary = {
        "total": len(results),
        "passed": sum(1 for r in results if r["status"] == "passed"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "errors": sum(1 for r in results if r["status"] == "error"),
        "duration": duration,
    }

    return {
        "collectionName": collection.get("info", {}).get("name", "collection"),
        "environment": env_name,
        "duration": duration,
        "results": results,
        "summary": summary,
    }
