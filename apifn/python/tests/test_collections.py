from __future__ import annotations

from pathlib import Path

import httpx
import yaml

from apifn import read_collection, run_collection


def test_tv_py_004_collection_read_and_run(tmp_path: Path) -> None:
    collection_dir = tmp_path / "collection"
    collection_dir.mkdir()

    (collection_dir / "opencollection.yml").write_text(
        yaml.safe_dump(
            {
                "info": {"name": "Sample"},
                "environments": {
                    "default": {
                        "variables": {
                            "baseUrl": "https://api.test",
                        }
                    }
                },
                "items": [
                    {
                        "kind": "request",
                        "name": "Ping",
                        "request": {
                            "http": {
                                "method": "GET",
                                "url": "{{baseUrl}}/ping",
                                "headers": [],
                            }
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    collection = read_collection(collection_dir)

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.test/ping"
        return httpx.Response(200, json={"ok": True})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    try:
        report = run_collection(collection, {"environment": "default", "client": client})
    finally:
        client.close()

    assert report["summary"]["total"] == 1
    assert report["summary"]["passed"] == 1
    assert report["results"][0]["status"] == "passed"


def test_run_collection_raises_for_missing_environment() -> None:
    collection = {
        "info": {"name": "Sample"},
        "environments": {"default": {"variables": {"baseUrl": "https://api.test"}}},
        "items": [],
    }

    try:
        run_collection(collection, {"environment": "staging"})
    except ValueError as exc:
        assert str(exc) == "Environment 'staging' not found"
    else:
        raise AssertionError("expected missing environment to raise")
