# superfunctions-core

> Core HTTP abstractions for the superfunctions ecosystem

**Location:** `packages/python-core/`  
**Package:** `superfunctions-core`
**Import:** `from superfunctions.http import ...`

## Installation

```bash
pip install 'superfunctions-core>=0.1.1,<0.2.0'
```

The distribution name changed because PyPI's `superfunctions` belongs to an
unrelated Youssef/youssefa metafunction project; its `0.1.3` release is not a
21n baseline. The Python import namespace remains `superfunctions`, with no
old-distribution compatibility shim. The initial core version is `0.1.1`.
Publish this prerequisite before releasing dependent Python SDKs or adapters;
until then, validate with the actual locally built wheel via `PIP_FIND_LINKS`.

## Usage

### HTTP Abstractions

```python
from superfunctions.http import Request, Response, RouteContext, NotFoundError

async def get_user_handler(request: Request, context: RouteContext) -> Response:
    user_id = context.params.get("id")
    
    user = await db.find_one(...)
    if not user:
        raise NotFoundError(f"User {user_id} not found")
    
    return Response(status=200, body=user)
```

## Adapters

Install adapter packages separately based on your stack:

### HTTP Framework Adapters

```bash
# FastAPI
pip install superfunctions-fastapi

# Flask
pip install superfunctions-flask
```

Additional framework adapters will be added over time.

## Documentation

- [HTTP Documentation](https://docs.superfunctions.dev/http)
- [API Reference](https://docs.superfunctions.dev/api)

## License

MIT
