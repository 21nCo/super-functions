# Python Shared Packages

This document describes the shared Python packages that provide reusable abstractions similar to the TypeScript packages (`@superfunctions/http` and `@superfunctions/db`).

## Overview

To avoid code duplication across Python implementations (authfn, plugfn, secfn, etc.), we've created two shared packages:

1. **`superfunctions-db`** - Database adapter system
2. **`superfunctions-http`** - HTTP abstraction layer

These packages mirror the architecture of their TypeScript counterparts, providing protocol-based abstractions that work with multiple frameworks and libraries.

## Architecture

```
packages/
├── py-db/                    # Database adapter system
│   └── superfunctions_db/
│       ├── adapter/
│       │   ├── types.py      # Core protocols and types
│       │   └── errors.py     # Error types
│       └── utils/
│           └── namespace.py  # Namespace management
│
├── py-http/                  # HTTP abstraction layer
│   └── superfunctions_http/
│       ├── types.py          # Request/Response protocols
│       └── middleware/       # Middleware utilities
│
authfn/python/
├── authfn/
│   └── adapter.py           # Bridge to superfunctions-db
│
plugfn/python/
├── plugfn/
│   └── adapter.py           # Bridge to superfunctions-db
│
secfn/python/
├── secfn/
│   └── adapter.py           # Bridge to superfunctions-db
```

## Package: superfunctions-db

### Installation

```bash
pip install superfunctions-db

# With optional dependencies
pip install superfunctions-db[sqlalchemy]
pip install superfunctions-db[django]
pip install superfunctions-db[tortoise]
```

### Key Features

- **Protocol-based design**: Define a database adapter protocol that any ORM can implement
- **Type-safe operations**: Pydantic models for all parameters
- **Namespace support**: Multi-tenant table prefixing or schema-based isolation
- **Transaction support**: First-class transaction handling
- **Batch operations**: Efficient bulk operations
- **Schema management**: Define and validate schemas

### Core Types

```python
from superfunctions_db import (
    Adapter,                # Main adapter protocol
    CreateParams,           # Parameters for create operations
    FindOneParams,          # Parameters for findOne
    FindManyParams,         # Parameters for findMany
    UpdateParams,           # Parameters for update
    DeleteParams,           # Parameters for delete
    WhereClause,            # Query filters
    OrderBy,                # Sorting
    Operator,               # Query operators (EQ, GT, LT, etc.)
)
```

### Example Usage

```python
from superfunctions_db import (
    Adapter,
    CreateParams,
    FindManyParams,
    WhereClause,
    Operator,
)

async def example(adapter: Adapter):
    # Create a record
    user = await adapter.create(
        CreateParams(
            model="users",
            data={"name": "Alice", "email": "alice@example.com"},
        )
    )
    
    # Query records
    users = await adapter.find_many(
        FindManyParams(
            model="users",
            where=[
                WhereClause(
                    field="email",
                    operator=Operator.LIKE,
                    value="%@example.com"
                )
            ],
            limit=10,
        )
    )
```

### Integration with Existing Packages

Each Python package (authfn, plugfn, secfn) includes an `adapter.py` module that:

1. **Maintains backwards compatibility** with legacy interfaces
2. **Provides adapter wrappers** for superfunctions-db
3. **Makes adoption optional** - packages work with or without superfunctions-db

#### Example: authfn Integration

```python
from authfn import SuperfunctionsDbAdapter
from superfunctions_db import Adapter

# Wrap your superfunctions-db adapter
my_db_adapter: Adapter = ...  # Your adapter implementation
authfn_adapter = SuperfunctionsDbAdapter(my_db_adapter)

# Use with authfn
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(
    AuthFnConfig(
        database=authfn_adapter,
        namespace="authfn",
    )
)
```

## Package: superfunctions-http

### Installation

```bash
pip install superfunctions-http

# With framework support
pip install superfunctions-http[fastapi]
pip install superfunctions-http[flask]
pip install superfunctions-http[django]
```

### Key Features

- **Protocol-based requests**: Work with any web framework
- **Type-safe responses**: Pydantic models for responses
- **Middleware support**: Composable middleware chain
- **CORS handling**: Built-in CORS configuration
- **Structured errors**: HTTP error classes with consistent responses

### Core Types

```python
from superfunctions_http import (
    Request,                # Generic request protocol
    Response,               # Response model
    Route,                  # Route definition
    RouteContext,           # Context passed to handlers
    HttpMethod,             # HTTP methods enum
    HttpError,              # Base error class
    BadRequestError,        # 400
    UnauthorizedError,      # 401
    NotFoundError,          # 404
    # ... other error types
)
```

### Example Usage

```python
from superfunctions_http import (
    Request,
    Response,
    RouteContext,
    HttpMethod,
)

async def get_user_handler(request: Request, context: RouteContext) -> Response:
    user_id = context.params["id"]
    
    # Your logic here
    user = {"id": user_id, "name": "Alice"}
    
    return Response(
        status=200,
        body=user,
    )
```

### Framework Adapters

Create simple adapters for your web framework:

```python
# FastAPI example
from fastapi import Request as FastAPIRequest
from superfunctions_http import Request

class FastAPIRequestAdapter:
    def __init__(self, request: FastAPIRequest):
        self._request = request
    
    @property
    def method(self) -> str:
        return self._request.method
    
    @property
    def path(self) -> str:
        return self._request.url.path
    
    # ... implement other protocol methods
```

## Benefits of Shared Packages

### 1. Code Reuse

**Before:**
- authfn/python: 50 lines of database adapter code
- plugfn/python: 50 lines of database adapter code
- secfn/python: 50 lines of database adapter code
- **Total: 150 lines duplicated**

**After:**
- packages/py-db: 200 lines (comprehensive, tested)
- authfn/python: 20 lines (adapter bridge)
- plugfn/python: 20 lines (adapter bridge)
- secfn/python: 20 lines (adapter bridge)
- **Total: 260 lines, but no duplication, better quality**

### 2. Consistent APIs

All packages now use the same query syntax:

```python
# Same query syntax across all packages
where = [
    WhereClause(field="email", operator=Operator.EQ, value="alice@example.com")
]
```

### 3. Better Testing

- Write adapter tests once in superfunctions-db
- All packages benefit from comprehensive test coverage
- Framework adapters can be tested independently

### 4. Easier Maintenance

- Bug fixes in one place benefit all packages
- Add new features (e.g., new operators) in one place
- Documentation improvements help all users

### 5. Ecosystem Growth

- Third-party adapter implementations can be shared
- SQLAlchemy adapter works for all packages
- Django ORM adapter works for all packages
- Community can contribute adapters once, benefit everyone

## Migration Guide

### For Package Maintainers

To migrate an existing Python package to use the shared packages:

1. **Add dependency:**
   ```toml
   [project.optional-dependencies.db]
   superfunctions-db = ["superfunctions-db>=0.1.0"]
   ```

2. **Create adapter bridge** (`adapter.py`):
   ```python
   from superfunctions_db import Adapter, CreateParams, FindManyParams
   
   class SuperfunctionsDbAdapter:
       def __init__(self, adapter: Adapter):
           self.adapter = adapter
       
       # Implement bridge methods
   ```

3. **Update imports:**
   ```python
   # Before
   from .types import DatabaseAdapter, WhereClause
   
   # After
   from .adapter import DatabaseAdapter, WhereClause, SuperfunctionsDbAdapter
   ```

4. **Maintain backwards compatibility:**
   - Keep legacy interfaces working
   - Make superfunctions-db optional
   - Provide clear migration path for users

### For Package Users

Using packages with superfunctions-db:

```python
# Option 1: Use legacy interface (no changes needed)
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(
    AuthFnConfig(
        database=my_custom_adapter,  # Implements legacy protocol
        namespace="authfn",
    )
)

# Option 2: Use superfunctions-db adapter (new way)
from authfn import create_authfn, AuthFnConfig, SuperfunctionsDbAdapter
from my_db_library import create_adapter

db_adapter = create_adapter(...)  # Returns superfunctions_db.Adapter
authfn_adapter = SuperfunctionsDbAdapter(db_adapter)

auth = create_authfn(
    AuthFnConfig(
        database=authfn_adapter,
        namespace="authfn",
    )
)
```

## Comparison with TypeScript Packages

| Feature | TypeScript | Python |
|---------|------------|--------|
| **DB Package** | `@superfunctions/db` | `superfunctions-db` |
| **HTTP Package** | `@superfunctions/http` | `superfunctions-http` |
| **Type System** | TypeScript interfaces | Python Protocols + Pydantic |
| **Async** | Promise-based | async/await |
| **Adapters** | Drizzle, Prisma, Kysely | SQLAlchemy, Django, Tortoise |
| **Distribution** | npm | PyPI |

## Future Enhancements

### Phase 1 (Current)
- ✅ Core protocols and types
- ✅ Backwards compatibility layers
- ✅ Documentation

### Phase 2 (Planned)
- 🔄 SQLAlchemy adapter implementation
- 🔄 Django ORM adapter implementation
- 🔄 Framework adapters for HTTP (FastAPI, Flask)

### Phase 3 (Future)
- 📋 Migration tools
- 📋 Testing utilities
- 📋 Performance benchmarks
- 📋 Additional ORM support

## Contributing

Contributions are welcome! Areas where help is needed:

1. **Adapter implementations** for popular ORMs
2. **Framework adapters** for web frameworks
3. **Documentation improvements**
4. **Example applications**
5. **Testing and bug reports**

## License

MIT - Same as other superfunctions packages

## Questions & Support

- **GitHub Issues**: https://github.com/21nCo/super-functions/issues
- **Documentation**: https://docs.superfunctions.dev
- **Discord**: Join our community for discussions

---

**Related Documentation:**
- [packages/py-db/README.md](py-db/README.md) - Database adapter documentation
- [packages/py-http/README.md](py-http/README.md) - HTTP abstraction documentation
- [TypeScript Packages](../README.md) - TypeScript package documentation
