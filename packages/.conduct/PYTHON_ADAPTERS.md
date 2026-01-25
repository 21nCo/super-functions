# Python Packages & Adapters

## Package Structure (Simplified!)

```
packages/
├── python-core/              # superfunctions (core)
│   ├── pyproject.toml
│   └── superfunctions/
│       ├── __init__.py
│       ├── db/              # Database abstractions
│       └── http/            # HTTP abstractions
│
├── python-sqlalchemy/        # superfunctions-sqlalchemy
│   ├── pyproject.toml
│   └── superfunctions_sqlalchemy/
│       ├── __init__.py
│       └── adapter.py
│
├── python-fastapi/           # superfunctions-fastapi
│   ├── pyproject.toml
│   └── superfunctions_fastapi/
│       ├── __init__.py
│       └── adapter.py
│
└── python-flask/             # superfunctions-flask
    ├── pyproject.toml
    └── superfunctions_flask/
        ├── __init__.py
        └── adapter.py
```

## Why This Structure?

### ✅ Flat and Clear
```
# Easy to navigate
cd packages/python-core
cd packages/python-sqlalchemy
cd packages/python-fastapi

# vs confusing nested structure
cd packages/python/superfunctions-core
cd packages/python/superfunctions-sqlalchemy
```

### ✅ Name Matches Package
```
Folder: python-core          → Package: superfunctions
Folder: python-sqlalchemy    → Package: superfunctions-sqlalchemy
Folder: python-fastapi       → Package: superfunctions-fastapi
```

### ✅ Consistent with TypeScript
```
TypeScript:
packages/http/              → @superfunctions/http
packages/http-express/      → @superfunctions/http-express

Python:
packages/python-core/       → superfunctions
packages/python-fastapi/    → superfunctions-fastapi
```

## Installation

```bash
# Core package
pip install superfunctions

# With SQLAlchemy
pip install superfunctions superfunctions-sqlalchemy

# With FastAPI
pip install superfunctions superfunctions-fastapi

# Full stack
pip install superfunctions superfunctions-sqlalchemy superfunctions-fastapi
```

## Usage

### Database Operations
```python
from superfunctions.db import CreateParams, FindManyParams, WhereClause, Operator
from superfunctions_sqlalchemy import create_adapter
from sqlalchemy import create_engine

# Create adapter
engine = create_engine("postgresql://localhost/mydb")
adapter = create_adapter(engine)

# Use with any superfunctions library
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(AuthFnConfig(database=adapter))
```

### HTTP Server
```python
from superfunctions.http import Route, HttpMethod, Response
from superfunctions_fastapi import create_router
from fastapi import FastAPI

app = FastAPI()

async def get_user(request, context):
    user_id = context.params["id"]
    return Response(status=200, body={"id": user_id})

routes = [
    Route(method=HttpMethod.GET, path="/users/{id}", handler=get_user)
]

router = create_router(routes)
app.include_router(router)
```

## Available Adapters

### Database Adapters
- ✅ **superfunctions-sqlalchemy** - SQLAlchemy (PostgreSQL, MySQL, SQLite)
- 📝 **superfunctions-django** - Django ORM (coming soon)
- 📝 **superfunctions-tortoise** - Tortoise ORM (coming soon)

### HTTP Framework Adapters
- ✅ **superfunctions-fastapi** - FastAPI
- ✅ **superfunctions-flask** - Flask
- 📝 **superfunctions-django** - Django (coming soon)

## Benefits

1. **Simple Structure**: Flat hierarchy, easy to navigate
2. **Clear Naming**: Package name matches folder name
3. **Modular**: Install only what you need
4. **Type Safe**: Full protocol and Pydantic support
5. **Framework Agnostic**: Write once, run anywhere

## Comparison

| Aspect | Old Structure | New Structure |
|--------|---------------|---------------|
| **Navigation** | `packages/python/superfunctions-core/` | `packages/python-core/` |
| **Nesting** | 3 levels | 2 levels |
| **Clarity** | Redundant "python" folder | Clear prefix |
| **Consistency** | Different from TypeScript | Matches TypeScript pattern |

## Examples

See the [QUICK_START.md](QUICK_START.md) for more examples!

## License

MIT
