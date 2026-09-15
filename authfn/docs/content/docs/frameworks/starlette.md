---
title: Starlette
description: Starlette apps mount Python authfn through FastAPI — there is no dedicated Starlette extra.
---

# Starlette

There is no `authfn[starlette]` extra and no `superfunctions_starlette` adapter.

Starlette apps should mount through [FastAPI](./fastapi) (`pip install "authfn[fastapi]"`). FastAPI is Starlette-based, and `superfunctions_fastapi` is the supported Python ASGI adapter.

```bash
pip install "authfn[fastapi]"
```

See [Frameworks → FastAPI](./fastapi) for the mount example.

## Related

- [SDKs → Python](../sdk/python)
- [Frameworks → FastAPI](./fastapi)
