---
title: FastAPI
description: Production-grade FastAPI integration — Starlette request bridging, async session resolvers, and reverse-proxy guidance.
---

# FastAPI

```python
from fastapi import FastAPI, Request
from fastapi.responses import Response

from filefn.server import create_file_fn, FileFnConfig
from filefn_storage_local import create_local_storage
from filefn_db_postgres import create_postgres_adapter

db = create_postgres_adapter(dsn=os.environ["DATABASE_URL"])
storage = create_local_storage(root_dir="./.filefn-storage")

filefn = create_file_fn(FileFnConfig(
    db=db,
    storage=storage,
    policies=[
        {
            "name": "public-image",
            "contentTypes": ["image/png", "image/jpeg", "image/webp"],
            "maxSizeBytes": 10 * 1024 * 1024,
            "visibility": "public",
        }
    ],
))

app = FastAPI()


@app.api_route("/filefn/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def filefn_handler(request: Request) -> Response:
    response = await filefn.router.handle(request)
    if response is None:
        return Response("Not Found", status_code=404)
    return response
```

## CORS

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["APP_ORIGIN"]],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["content-type", "authorization", "x-request-id", "x-idempotency-key", "x-upload-session-token"],
    expose_headers=["x-request-id", "etag"],
)
```

## Session resolution

If you're using `authfn-py`:

```python
from authfn.server import create_auth_fn

authfn = create_auth_fn(...)


async def resolve_session(request):
    session = await authfn.get_session(request)
    if session:
        return {"principalId": session.user_id, "tenantId": session.tenant_id}
    return None


filefn = create_file_fn(FileFnConfig(
    db=db,
    storage=storage,
    auth={"resolveSession": resolve_session, "required": False},
))
```

## Body handling

FastAPI typically reads the body via `await request.body()`. The kernel reads it itself from the underlying ASGI receive — don't call `.body()` before passing the request through.

If a middleware in the chain has already buffered the body, wrap the kernel call to re-read it:

```python
async def filefn_handler(request: Request):
    body = await request.body()
    # rebuild a Starlette Request that yields `body` from receive()
    ...
```

In practice, only specific middlewares need this — most don't.

## Reverse proxy

Behind nginx / Cloudflare:

- Set `proxy_request_buffering off` for `/filefn/upload/.*/parts/.*` so part PUTs stream rather than buffer.
- Increase `client_max_body_size` to your largest expected part (default 5 MiB is fine).
- Forward `X-Forwarded-For` for IP-based rate limiting.

## See also

- [Quickstart › FastAPI](../quickstart/fastapi) — minimal version.
