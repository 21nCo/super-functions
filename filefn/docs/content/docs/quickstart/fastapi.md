---
title: FastAPI Quickstart
description: Mount filefn (Python kernel) on a FastAPI app with a single sub-app route.
---

# FastAPI

The Python `filefn` package mirrors the TypeScript kernel one-to-one: the same routes, the same envelopes, the same error codes. You configure it through `FileFnConfig`, mount it on FastAPI, and call it from any of the typed clients.

## Install

```bash
pip install filefn fastapi uvicorn
# Pick a storage and DB adapter from the superfunctions ecosystem.
# For local dev, use the bundled in-memory adapters via your own glue.
```

## Server

```python
from fastapi import FastAPI, Request, Response
from filefn.server import create_file_fn, FileFnConfig
from filefn.processing.processors.thumbnail import (
    create_thumbnail_processor,
    ThumbnailConfig,
)

# Replace these with your real adapters (Postgres + S3 in prod).
db_adapter = ...
storage_adapter = ...

filefn = create_file_fn(
    FileFnConfig(
        db=db_adapter,
        storage=storage_adapter,
        namespace="filefn",
        policies=[
            {
                "name": "public-image",
                "contentTypes": ["image/png", "image/jpeg", "image/gif", "image/webp"],
                "maxSizeBytes": 10 * 1024 * 1024,
                "visibility": "public",
            },
        ],
        signed_url_ttl_seconds=900,
        processing={
            "enabled": True,
            "processors": [
                create_thumbnail_processor(
                    ThumbnailConfig(
                        format="jpeg",
                        quality=80,
                        sizes=[
                            {"name": "thumb", "width": 256, "height": 256},
                            {"name": "preview", "width": 1024, "height": 1024},
                        ],
                    )
                ),
            ],
        },
    )
)

app = FastAPI()


@app.api_route(
    "/filefn/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def filefn_handler(path: str, request: Request) -> Response:
    forwarded_url = str(request.url).replace("/filefn", "", 1) or "/"
    forwarded = await rebuild_request(request, forwarded_url)

    response = await filefn.router.handle(forwarded)
    if response is None:
        return Response(status_code=404)

    return Response(
        content=await response.body(),
        status_code=response.status_code,
        headers=dict(response.headers),
    )
```

`rebuild_request` is a small adapter you write to convert FastAPI's `Request` into the `filefn` kernel's request shape — it's a thin one-time bridge documented in [Frameworks › FastAPI](../frameworks/fastapi).

## Authentication

The simplest pattern is a dependency that resolves your existing session and forwards it to filefn:

```python
filefn = create_file_fn(
    FileFnConfig(
        db=db_adapter,
        storage=storage_adapter,
        auth={
            "required": True,
            "resolve_session": lambda request: resolve_my_session(request),
        },
    )
)
```

`resolve_my_session` returns `{"principalId": ..., "tenantId": ...}` or `None`. Same shape as the TypeScript kernel.

## Verifying

```bash
curl http://127.0.0.1:8000/filefn/policies
# → {"ok": true, "data": {"policies": [{"name": "public-image", ...}]}}
```

## Next steps

- [Frameworks › FastAPI](../frameworks/fastapi) — production wiring with Uvicorn workers, structured logging, and per-route rate limiting.
- [SDKs › Python](../sdk/python) — the full `filefn` Python package reference.
