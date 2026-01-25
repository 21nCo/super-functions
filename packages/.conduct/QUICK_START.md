# Quick Start: Python Shared Packages

## Installation

### superfunctions-db

```bash
# Basic installation
pip install superfunctions-db

# With SQLAlchemy support
pip install superfunctions-db[sqlalchemy]

# With Django support
pip install superfunctions-db[django]
```

### superfunctions-http

```bash
# Basic installation
pip install superfunctions-http

# With FastAPI support
pip install superfunctions-http[fastapi]

# With Flask support
pip install superfunctions-http[flask]
```

## Using with authfn

```python
# Option 1: Use legacy interface (no changes)
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(
    AuthFnConfig(
        database=my_adapter,  # Your custom adapter
        namespace="authfn",
    )
)

# Option 2: Use superfunctions-db adapter
from authfn import SuperfunctionsDbAdapter, create_authfn, AuthFnConfig
from superfunctions_db import Adapter

# Your superfunctions-db adapter
my_db_adapter: Adapter = ...

# Wrap it for authfn
authfn_adapter = SuperfunctionsDbAdapter(my_db_adapter)

# Use it
auth = create_authfn(
    AuthFnConfig(
        database=authfn_adapter,
        namespace="authfn",
    )
)
```

## Using with plugfn

```python
from plugfn import SuperfunctionsDbAdapter, PlugFn, PlugFnConfig
from superfunctions_db import Adapter

# Your adapter
my_db_adapter: Adapter = ...

# Wrap it
plugfn_adapter = SuperfunctionsDbAdapter(my_db_adapter)

# Use it
plug = PlugFn(
    PlugFnConfig(
        database=plugfn_adapter,
        auth=auth_provider,
        base_url="https://myapp.com",
        encryption_key="your-key",
    )
)
```

## Using with secfn

```python
from secfn import SuperfunctionsDbAdapter, create_secfn, SecFnConfig
from superfunctions_db import Adapter

# Your adapter
my_db_adapter: Adapter = ...

# Wrap it
secfn_adapter = SuperfunctionsDbAdapter(my_db_adapter)

# Use it
secfn = create_secfn(
    SecFnConfig(
        database=secfn_adapter,
        master_key="your-master-key",
    )
)
```

## Creating a Database Adapter

To create your own adapter for superfunctions-db:

```python
from superfunctions_db import (
    Adapter,
    AdapterCapabilities,
    CreateParams,
    FindOneParams,
    FindManyParams,
    UpdateParams,
    DeleteParams,
    HealthStatus,
)

class MyDatabaseAdapter:
    """Custom database adapter."""
    
    def __init__(self, connection):
        self.connection = connection
        self.id = "my-database"
        self.name = "My Database"
        self.version = "1.0.0"
        self.capabilities = AdapterCapabilities(
            transactions=True,
            joins=True,
            full_text_search=False,
            json_operations=True,
        )
    
    async def create(self, params: CreateParams) -> dict:
        # Implement create logic
        table = params.model
        data = params.data
        # ... your implementation
        return created_record
    
    async def find_one(self, params: FindOneParams) -> dict | None:
        # Implement find_one logic
        table = params.model
        where = params.where
        # ... your implementation
        return record or None
    
    async def find_many(self, params: FindManyParams) -> list[dict]:
        # Implement find_many logic
        table = params.model
        where = params.where
        limit = params.limit
        # ... your implementation
        return records
    
    # Implement other methods...
    # update, delete, create_many, update_many, delete_many,
    # upsert, count, transaction, initialize, is_healthy, close,
    # get_schema_version, set_schema_version, validate_schema, create_schema
```

## Query Building

```python
from superfunctions_db import (
    FindManyParams,
    WhereClause,
    OrderBy,
    Operator,
    Direction,
)

# Find users with filters
users = await adapter.find_many(
    FindManyParams(
        model="users",
        where=[
            WhereClause(field="email", operator=Operator.LIKE, value="%@example.com"),
            WhereClause(field="active", operator=Operator.EQ, value=True),
        ],
        order_by=[
            OrderBy(field="created_at", direction=Direction.DESC)
        ],
        limit=10,
        offset=0,
    )
)
```

## Available Operators

```python
from superfunctions_db import Operator

# Comparison
Operator.EQ         # Equal
Operator.NE         # Not equal
Operator.GT         # Greater than
Operator.GTE        # Greater than or equal
Operator.LT         # Less than
Operator.LTE        # Less than or equal

# List operations
Operator.IN         # In list
Operator.NOT_IN     # Not in list

# String operations
Operator.LIKE       # SQL LIKE
Operator.ILIKE      # Case-insensitive LIKE
Operator.CONTAINS   # Contains substring
Operator.STARTS_WITH # Starts with
Operator.ENDS_WITH   # Ends with

# Null checks
Operator.IS_NULL     # Is NULL
Operator.IS_NOT_NULL # Is NOT NULL
```

## Error Handling

```python
from superfunctions_db import (
    AdapterError,
    ConnectionError,
    NotFoundError,
    DuplicateKeyError,
    ConstraintViolationError,
)

try:
    user = await adapter.create(params)
except DuplicateKeyError as e:
    print(f"User already exists: {e}")
except ConstraintViolationError as e:
    print(f"Constraint violation: {e}")
except ConnectionError as e:
    print(f"Database connection failed: {e}")
except AdapterError as e:
    print(f"Database error: {e.code} - {e.message}")
```

## Namespace Management

```python
from superfunctions_db import create_namespace_manager

# Create namespace manager
ns_manager = create_namespace_manager(
    separator="_",              # Use underscore separator
    use_schema=False,          # Use table prefixes, not schemas
    default_namespace="app",   # Default namespace
)

# Get table name with namespace
table_name = ns_manager.get_table_name("users", namespace="tenant1")
# Returns: "tenant1_users"

# Use with adapter
users = await adapter.find_many(
    FindManyParams(
        model="users",
        namespace="tenant1",  # Automatically prefixes table name
    )
)
```

## HTTP Usage

```python
from superfunctions_http import (
    Request,
    Response,
    RouteContext,
    HttpMethod,
    NotFoundError,
    UnauthorizedError,
)

# Define a handler
async def get_user_handler(request: Request, context: RouteContext) -> Response:
    # Get path parameter
    user_id = context.params.get("id")
    
    # Check authorization
    auth_header = context.headers.get("authorization")
    if not auth_header:
        raise UnauthorizedError("Missing authorization header")
    
    # Query database
    user = await db.find_one(...)
    if not user:
        raise NotFoundError(f"User {user_id} not found")
    
    # Return response
    return Response(
        status=200,
        headers={"Content-Type": "application/json"},
        body=user,
    )
```

## Next Steps

1. **Read the full documentation**:
   - [packages/py-db/README.md](py-db/README.md)
   - [packages/py-http/README.md](py-http/README.md)
   - [packages/PYTHON_PACKAGES.md](PYTHON_PACKAGES.md)

2. **Check examples**:
   - See how authfn uses the adapters
   - See how plugfn uses the adapters
   - See how secfn uses the adapters

3. **Contribute**:
   - Implement adapters for popular ORMs
   - Add framework integrations
   - Improve documentation
   - Report bugs

## Support

- **GitHub**: https://github.com/21nCo/super-functions
- **Issues**: https://github.com/21nCo/super-functions/issues
- **Docs**: https://docs.superfunctions.dev
