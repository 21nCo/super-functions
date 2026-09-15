---
title: Starlette
description: Starlette apps mount Python authfn through FastAPI — there is no dedicated Starlette extra.
---

# Starlette

There is no `authfn[starlette]` extra and no `superfunctions_starlette` adapter.

Starlette apps should mount through [FastAPI](./fastapi). FastAPI is Starlette-based, and `superfunctions-fastapi` is the supported Python ASGI adapter.

```bash
pip install authfn superfunctions-fastapi
```

See [Frameworks → FastAPI](./fastapi) for the mount example (`create_router(auth.get_routes(), prefix="/auth")`).

## Related

- [SDKs → Python](../sdk/python)
- [Frameworks → FastAPI](./fastapi)
