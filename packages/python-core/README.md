# superfunctions

> Core HTTP abstractions for the superfunctions ecosystem

**Location:** `packages/python-core/`  
**Package:** `superfunctions`  
**Import:** `from superfunctions.http import ...`

## Installation

```bash
pip install superfunctions
```

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
