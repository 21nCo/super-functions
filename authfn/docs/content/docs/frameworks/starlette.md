---
title: Starlette
description: Mount the Python authfn kernel on Starlette / pure ASGI.
---

# Starlette

```bash
pip install "authfn[starlette]"
```

```python
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from superfunctions_starlette import to_starlette
from authfn import create_authfn, AuthFnConfig, authfn_password_plugin
from authfn.adapters.memory import memory_adapter

auth = create_authfn(AuthFnConfig(
    database=memory_adapter(),
    namespace="authfn",
    plugins=[authfn_password_plugin()],
))

async def me(request):
    session = await auth.provider.authenticate(request)
    if not session:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return JSONResponse({"user": session.subject})

routes = [
    *to_starlette(auth.router, base_path="/auth"),
    Route("/me", me, methods=["GET"]),
]

app = Starlette(routes=routes)
```

`to_starlette` returns a list of `Route` objects you splat into your routes list. Mount under any prefix — pass `base_path`.

## Pure ASGI

If you'd rather not depend on Starlette, the underlying router exposes `auth.router.dispatch(scope, receive, send)` directly. The Starlette adapter is a thin wrapper.

## Related

- [SDKs → Python](../sdk/python)
