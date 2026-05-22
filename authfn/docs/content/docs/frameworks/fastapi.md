---
title: FastAPI
description: Mount the Python authfn kernel on FastAPI.
---

# FastAPI

```bash
pip install "authfn[fastapi]"
```

```python
from fastapi import FastAPI, Request
from superfunctions_fastapi import to_fastapi
from authfn import create_authfn, AuthFnConfig, authfn_password_plugin
from authfn.adapters.memory import memory_adapter

auth = create_authfn(AuthFnConfig(
    database=memory_adapter(),
    namespace="authfn",
    plugins=[authfn_password_plugin()],
))

app = FastAPI()
app.include_router(to_fastapi(auth.router), prefix="/auth")

@app.get("/me")
async def me(request: Request):
    session = await auth.provider.authenticate(request)
    if not session:
        return {"error": "unauthorized"}, 401
    return {"user": session.subject}
```

## Dependency injection

```python
from fastapi import Depends, HTTPException, Request

async def require_session(request: Request):
    session = await auth.provider.authenticate(request)
    if not session:
        raise HTTPException(status_code=401)
    return session

@app.get("/protected")
async def protected(session = Depends(require_session)):
    return {"user": session.subject}
```

## ASGI middleware

`to_fastapi` is itself an `APIRouter`. If you want to add middleware (CORS, logging) before authfn, do so on the FastAPI app — it composes naturally.

## Related

- [SDKs → Python](../sdk/python)
