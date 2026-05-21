---
title: Flask
description: Mount the Python authfn kernel on Flask.
---

# Flask

```bash
pip install "authfn[flask]"
```

```python
from flask import Flask, request, jsonify
from superfunctions_flask import to_flask
from authfn import create_authfn, AuthFnConfig, authfn_password_plugin
from authfn.adapters.memory import memory_adapter

auth = create_authfn(AuthFnConfig(
    database=memory_adapter(),
    namespace="authfn",
    plugins=[authfn_password_plugin()],
))

app = Flask(__name__)
to_flask(app, auth.router, base_path="/auth")

@app.get("/me")
async def me():
    session = await auth.provider.authenticate(request)
    if not session:
        return {"error": "unauthorized"}, 401
    return jsonify(user=session.subject)
```

## Async vs sync

Flask runs your view functions synchronously by default. authfn's `authenticate` is async, so either:

- Use Flask 2.0+ async view functions (shown above), or
- Use `asyncio.run(...)` in sync views.

## Related

- [SDKs → Python](../sdk/python)
