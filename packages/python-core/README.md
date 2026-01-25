# superfunctions

> Core abstractions for the superfunctions ecosystem - database adapters and HTTP utilities

**Location:** `packages/python-core/`  
**Package:** `sfns`  
**Import:** `from superfunctions.db import ...` or `from superfunctions.http import ...`

## Installation

```bash
pip install sfns
```

## Usage

### Database Adapters

```python
from superfunctions.db import (
    Adapter,
    CreateParams,
    FindManyParams,
    WhereClause,
    Operator,
)

# Use with any adapter implementation
user = await adapter.create(
    CreateParams(
        model="users",
        data={"name": "Alice", "email": "alice@example.com"},
    )
)

# Query with filters
users = await adapter.find_many(
    FindManyParams(
        model="users",
        where=[
            WhereClause(field="email", operator=Operator.LIKE, value="%@example.com")
        ],
        limit=10,
    )
)
```

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

### Database Adapters

```bash
# SQLAlchemy (coming soon)
pip install superfunctions-sqlalchemy

# Django ORM (coming soon)
pip install superfunctions-django

# Tortoise ORM (coming soon)
pip install superfunctions-tortoise
```

### HTTP Framework Adapters

```bash
# FastAPI (coming soon)
pip install superfunctions-fastapi

# Flask (coming soon)
pip install superfunctions-flask

# Django (coming soon)
pip install superfunctions-django
```

## Documentation

- [Database Documentation](https://docs.superfunctions.dev/db)
- [HTTP Documentation](https://docs.superfunctions.dev/http)
- [API Reference](https://docs.superfunctions.dev/api)

## License

MIT
