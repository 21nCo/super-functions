---
title: Python (FastAPI / Flask)
description: Run authfn on a Python backend — same routes, same envelopes, same OpenAPI as the TypeScript kernel.
---

# Python quickstart

The Python `authfn` package mirrors the TypeScript kernel: same routes, same envelopes, same plugin set, same OpenAPI surface. You can serve a Python and a Node authfn instance side-by-side and clients won't be able to tell them apart.

## 1. Install

```bash
pip install authfn
# or
pip install "authfn[fastapi]"
pip install "authfn[flask]"
```

## 2. Create the runtime

```python
# auth.py
from authfn import (
    AuthFnConfig,
    authfn_email_otp_plugin,
    authfn_password_plugin,
    authfn_social_oauth_plugin,
    create_authfn,
)

# Replace `my_database_adapter` with your real adapter; see Adapters > Database.
auth = create_authfn(AuthFnConfig(
    database=my_database_adapter,
    namespace="authfn",
    plugins=[
        authfn_password_plugin(),
        authfn_email_otp_plugin({
            "delivery": my_delivery_provider,
        }),
        authfn_social_oauth_plugin({
            "providers": {
                "google": {
                    "client_id": "...",
                    "client_secret": "...",
                    "allowlisted_return_to": ["https://app.example.com/post-auth"],
                },
            },
        }),
    ],
))
```

## 3. Mount on FastAPI

```python
# main.py
from fastapi import FastAPI, Request
from superfunctions_fastapi import to_fastapi
from auth import auth

app = FastAPI()
app.include_router(to_fastapi(auth.router), prefix="/auth")

@app.get("/protected")
async def protected(request: Request):
    session = await auth.provider.authenticate(request)
    if not session:
        return {"error": "unauthorized"}, 401
    return {"user": session.primary_email}
```

## 4. Or mount on Flask

```python
# main.py
from flask import Flask, request
from superfunctions_flask import to_flask
from auth import auth

app = Flask(__name__)
to_flask(app, auth.router, base_path="/auth")

@app.get("/protected")
async def protected():
    session = await auth.provider.authenticate(request)
    if not session:
        return {"error": "unauthorized"}, 401
    return {"user": session.primary_email}
```

## 5. Generate OpenAPI

```python
document = auth.open_api()
```

The output is identical in shape to the Node kernel's `auth.openApi()`.

## Next steps

- [SDKs → Python](../sdk/python) for full reference on Python types, error model, configuration, and advanced patterns.
- [Frameworks → FastAPI](../frameworks/fastapi), [Flask](../frameworks/flask), [Starlette](../frameworks/starlette).
- [Adapters → Database](../adapters/database) — Python supports SQLAlchemy adapters; the contract matches the Node kernel.
