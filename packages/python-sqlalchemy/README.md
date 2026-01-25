# superfunctions-sqlalchemy

SQLAlchemy adapter for `superfunctions.db`

**Location:** `packages/python-sqlalchemy/`  
**Package:** `superfunctions-sqlalchemy`  
**Import:** `from superfunctions_sqlalchemy import create_adapter`

## Installation

```bash
pip install superfunctions-sqlalchemy

# With PostgreSQL
pip install superfunctions-sqlalchemy[postgres]

# With MySQL
pip install superfunctions-sqlalchemy[mysql]

# With async support
pip install superfunctions-sqlalchemy[asyncpg]
```

## Usage

```python
from sqlalchemy import create_engine
from superfunctions_sqlalchemy import create_adapter

# Create SQLAlchemy engine
engine = create_engine("postgresql://user:password@localhost/dbname")

# Create adapter
adapter = create_adapter(engine)

# Use with superfunctions libraries
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(
    AuthFnConfig(
        database=adapter,
        namespace="authfn",
    )
)
```

## Features

- ✅ Full CRUD operations
- ✅ Transaction support
- ✅ Batch operations
- ✅ Query builders (where, orderBy, limit, offset)
- ✅ All SQL operators
- ✅ Works with PostgreSQL, MySQL, SQLite
- ✅ Sync and async engines

## Example

```python
from sqlalchemy import create_engine
from superfunctions_sqlalchemy import create_adapter
from superfunctions.db import CreateParams, FindManyParams, WhereClause, Operator

engine = create_engine("postgresql://localhost/mydb")
adapter = create_adapter(engine)

# Create
user = await adapter.create(
    CreateParams(
        model="users",
        data={"name": "Alice", "email": "alice@example.com"},
    )
)

# Query
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

## License

MIT
