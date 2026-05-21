---
title: Flask
description: Production-grade Flask integration — WSGI request bridging, async filefn calls via run_async, and reverse-proxy guidance.
---

# Flask

Flask is sync-WSGI by default. filefn's Python kernel is async, so the integration uses `asyncio.run` (or your favourite WSGI-async bridge) per request.

```python
import asyncio
import os
from flask import Flask, request, Response

from filefn.server import create_file_fn, FileFnConfig
from filefn_storage_local import create_local_storage
from filefn_db_sqlite import create_sqlite_adapter

db = create_sqlite_adapter(path="./filefn.db")
storage = create_local_storage(root_dir="./.filefn-storage")

filefn = create_file_fn(FileFnConfig(
    db=db,
    storage=storage,
    policies=[
        {
            "name": "public-image",
            "contentTypes": ["image/png", "image/jpeg"],
            "maxSizeBytes": 10 * 1024 * 1024,
            "visibility": "public",
        }
    ],
))

app = Flask(__name__)


@app.route("/filefn/<path:subpath>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def filefn_handler(subpath: str) -> Response:
    starlette_request = build_request_from_flask(request)  # see helper below
    response = asyncio.run(filefn.router.handle(starlette_request))
    if response is None:
        return Response("Not Found", status=404)
    return Response(
        response.body,
        status=response.status_code,
        headers=dict(response.headers.items()),
    )
```

The `build_request_from_flask` helper is short — Starlette ships `Request` constructors that take ASGI scopes; you build a synthetic scope from `request.environ`. The bundled `filefn_flask` companion package does this for you:

```python
from filefn_flask import flask_filefn_handler

app.route("/filefn/<path:subpath>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])(
    flask_filefn_handler(filefn)
)
```

## Async Flask (Quart-style)

If you'd rather not bridge sync-to-async, use `quart` (a Flask-shaped async framework). The integration is identical to FastAPI — see [FastAPI](./fastapi).

## CSRF

Flask-WTF or your own CSRF middleware for state-changing routes (`POST`, `PUT`, `DELETE`). Exempt `GET` / `HEAD`. The bundled clients send credentials and the CSRF token via header on every state-changing request.

## See also

- [Quickstart › Flask](../quickstart/flask) — minimal version.
