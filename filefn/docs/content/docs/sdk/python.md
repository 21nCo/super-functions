---
title: "filefn (Python)"
description: The Python kernel — create_file_fn, FileFnConfig, processors, providers.
---

# filefn (Python)

```bash
pip install filefn
```

The Python `filefn` package is a one-to-one port of `@filefn/server`. Same routes, same envelopes, same error codes. The shape of the configuration is identical; the field names use `snake_case` to match Python conventions.

## `create_file_fn`

```python
from filefn.server import create_file_fn, FileFnConfig

filefn = create_file_fn(
    FileFnConfig(
        db=db_adapter,
        storage=storage_adapter,
        namespace="filefn",
        policies=[
            {
                "name": "public-image",
                "contentTypes": ["image/png", "image/jpeg"],
                "maxSizeBytes": 10 * 1024 * 1024,
                "visibility": "public",
            }
        ],
        signed_url_ttl_seconds=900,
        upload_session_ttl_seconds=86400,
    )
)
```

`filefn.router.handle(request)` is the same single-dispatcher contract.

## Configuration

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `db` | `Adapter` | required | `superfunctions.db.Adapter`. |
| `storage` | `StorageAdapter` | required | `superfunctions.storage.StorageAdapter`. |
| `policies` | `List[Policy]` | `[]` | Initial policies. |
| `auth` | `AuthConfig` | `{}` | `resolve_session`, `required`. |
| `quota` | `QuotaProvider` | None | Optional. |
| `namespace` | `str` | `"filefn"` | Table prefix. |
| `signed_url_ttl_seconds` | `int` | `900` | |
| `upload_session_ttl_seconds` | `int` | `86400` | |
| `processing` | `Dict` | `{}` | `{enabled, processors, flow_fn}`. |
| `dedup` | `Dict` | `{enabled: False}` | `{enabled}`. |

## `FileProvider` (programmatic API)

```python
session = await filefn.create_upload_session(
    {
        "fileName": "x.png",
        "mimeType": "image/png",
        "size": 100,
        "policy": "public-image",
        "ownerId": "user-123",
    },
    ctx={"principalId": "user-123", "tenantId": "default"},
)

await filefn.complete_upload_part(
    {"uploadSessionId": session["uploadSessionId"], "partNumber": 1, "etag": "abc", "size": 100},
    ctx,
)

result = await filefn.complete_upload_session(
    {"uploadSessionId": session["uploadSessionId"]},
    ctx,
)
# result["fileId"], result["versionId"]
```

## Bundled processors

```python
from filefn.processing.processors.thumbnail import (
    create_thumbnail_processor,
    ThumbnailConfig,
)

thumb = create_thumbnail_processor(
    ThumbnailConfig(
        sizes=[
            {"name": "thumb", "width": 256, "height": 256},
            {"name": "preview", "width": 1024, "height": 1024},
        ],
        format="jpeg",
        quality=80,
    )
)
```

The Python package ships the same processor catalog as `@filefn/processing`:

- `create_thumbnail_processor`
- `create_pdf_preview_processor`
- `create_compression_processor`
- `create_ocr_processor`
- `create_image_transform_processor`
- `create_video_processor` (provider-pluggable)
- `create_audio_processor` (provider-pluggable)

## Events

The Python event emitter mirrors the TS one:

```python
@filefn.events.on("file:uploaded")
async def on_uploaded(event):
    print("uploaded", event["fileId"], event["versionId"])
```

## Errors

```python
from filefn.server.errors import FileFnError, ErrorCodes

try:
    await filefn.create_upload_session(...)
except FileFnError as error:
    if error.code == ErrorCodes.POLICY_NOT_FOUND:
        ...
```

## Mounting

See [Quickstart › FastAPI](../quickstart/fastapi) and [Quickstart › Flask](../quickstart/flask).

## When to pick Python over Node

The two kernels are interchangeable at the protocol layer. Pick Python when:

- the rest of your stack is Python (FastAPI / Django).
- you want to invoke processors directly from a Python data pipeline (e.g. Pillow + scikit-image).
- you're integrating with ML/CV tools that have first-class Python bindings.

Pick Node when:

- the rest of your stack is JavaScript / TypeScript.
- you want to share the kernel with a Bun / Workers edge deployment.

You can mix both — uploads go to Node, processing runs in Python — through the shared HTTP contract.
