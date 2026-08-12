---
title: Flask Quickstart
description: Mount filefn (Python kernel) as a Flask Blueprint.
---

# Flask

The Python `filefn` package can be mounted on Flask through a request → response shim — exactly the same approach as Express on the JS side.

## Install

```bash
pip install filefn flask
```

## Server

```python
from flask import Blueprint, Flask, request as flask_request
from filefn.server import create_file_fn, FileFnConfig

filefn = create_file_fn(
    FileFnConfig(
        db=db_adapter,
        storage=storage_adapter,
        policies=[
            {
                "name": "public-image",
                "contentTypes": ["image/png", "image/jpeg", "image/gif", "image/webp"],
                "maxSizeBytes": 10 * 1024 * 1024,
                "visibility": "public",
            }
        ],
    )
)


bp = Blueprint("filefn", __name__, url_prefix="/filefn")


@bp.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE"])
def filefn_handler(path: str):
    forwarded = build_forwarded_request(flask_request)
    response = await_run(filefn.router.handle(forwarded))
    if response is None:
        return ("", 404)
    return Response(
        response.body,
        status=response.status_code,
        headers=dict(response.headers),
    )


app = Flask(__name__)
app.register_blueprint(bp)
```

`build_forwarded_request` and `await_run` are the same pattern as in [FastAPI](./fastapi) — the kernel API is `async`, Flask's WSGI handlers are sync, so you bridge through a small `asyncio.run` wrapper. ASGI / Quart deployments can call the kernel directly.

## Why this pattern

Flask's request model predates the Fetch standard. The shim is the smallest possible bridge that preserves headers, body, and method. If you're starting fresh, use [FastAPI](./fastapi) — it's already async-native.

## Next steps

- [Frameworks › Flask](../frameworks/flask) — production wiring (gunicorn workers, ASGI shim, request streaming).
