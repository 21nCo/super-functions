# TypeScript to Python Implementation Comparison

This document compares the current TypeScript authfn package split with the Python implementation.

## Architecture Comparison

### TypeScript Structure
```text
authfn/
├── core/             # Server/runtime implementation
│   ├── src/
│   ├── package.json
│   └── README.md
├── client/           # Browser/client package
├── svelte/           # Svelte integration layer
└── examples/         # End-to-end package usage examples
```

### Python Structure
```
authfn/python/
├── authfn/
│   ├── __init__.py   # Public API exports
│   ├── authfn.py     # Main implementation
│   ├── types.py      # Type definitions (Pydantic models)
│   └── schema.py     # Database schema
├── tests/
│   ├── __init__.py
│   └── test_authfn.py
├── examples/
│   ├── __init__.py
│   └── basic_usage.py
├── pyproject.toml
├── setup.py
├── LICENSE
└── README.md
```

## Feature Parity

### Core Features

| Feature | TypeScript | Python | Notes |
|---------|-----------|--------|-------|
| API Key Generation | ✅ | ✅ | Both use cryptographically secure random generation |
| Authentication | ✅ | ✅ | Bearer token authentication |
| Authorization | ✅ | ✅ | Resource-based access control |
| Key Revocation | ✅ | ✅ | Full revocation support |
| Key Expiration | ✅ | ✅ | Automatic expiration checking |
| Metadata Support | ✅ | ✅ | Custom metadata per key |
| Scopes | ✅ | ✅ | Optional scope-based permissions |
| Database Abstraction | ✅ | ✅ | Adapter pattern for different databases |
| Schema Definition | ✅ | ✅ | Declarative schema for table generation |

### API Comparison

#### Creating an Instance

**TypeScript (`@authfn/core`):**
```typescript
import { createAuthFn } from '@authfn/core';

const auth = createAuthFn({
  database: adapter,
  namespace: 'authfn',
  enableApi: true,
  apiConfig: {
    adminKey: process.env.ADMIN_KEY,
  },
});
```

**Python:**
```python
from authfn import create_authfn, AuthFnConfig

auth = create_authfn(
    AuthFnConfig(
        database=adapter,
        namespace="authfn",
        enable_api=True,
        api_config={
            "admin_key": os.environ.get("ADMIN_KEY"),
        },
    )
)
```

#### Creating an API Key

**TypeScript:**
```typescript
const result = await auth.createKey({
  name: 'Production Key',
  resourceIds: ['resource-1', 'resource-2'],
  scopes: ['read', 'write'],
  metadata: { env: 'production' },
  expiresAt: new Date('2025-12-31'),
});
```

**Python:**
```python
from authfn.types import ApiKeyCreate

result = await auth.create_key(
    ApiKeyCreate(
        name="Production Key",
        resourceIds=["resource-1", "resource-2"],
        scopes=["read", "write"],
        metadata={"env": "production"},
        expiresAt=datetime(2025, 12, 31),
    )
)
```

#### Authenticating

**TypeScript:**
```typescript
const session = await auth.provider.authenticate(request);
if (session) {
  console.log(`Authenticated as: ${session.name}`);
}
```

**Python:**
```python
session = await auth.provider.authenticate(request)
if session:
    print(f"Authenticated as: {session.name}")
```

#### Authorizing

**TypeScript:**
```typescript
const canAccess = await auth.provider.authorize(session, 'resource-1');
```

**Python:**
```python
can_access = await auth.provider.authorize(session, "resource-1")
```

## Implementation Differences

### Type System

**TypeScript:**
- Uses TypeScript interfaces and types
- Compile-time type checking
- JSDoc comments for documentation

**Python:**
- Uses Pydantic models for runtime validation
- Type hints with Protocol for interfaces
- Both compile-time (mypy) and runtime validation
- Automatic JSON serialization/deserialization

### Async/Await

**TypeScript:**
- Native Promise-based async/await
- Works with Node.js event loop

**Python:**
- Native async/await with asyncio
- Coroutines and event loop
- Compatible with ASGI frameworks (FastAPI, Starlette)

### Error Handling

**TypeScript:**
```typescript
import { 
  InvalidCredentialsError, 
  ExpiredCredentialsError 
} from '@superfunctions/auth';

try {
  const session = await auth.provider.authenticate(request);
} catch (error) {
  if (error instanceof InvalidCredentialsError) {
    // Handle invalid credentials
  }
}
```

**Python:**
```python
from authfn.types import (
    InvalidCredentialsError,
    ExpiredCredentialsError,
)

try:
    session = await auth.provider.authenticate(request)
except InvalidCredentialsError:
    # Handle invalid credentials
    pass
except ExpiredCredentialsError:
    # Handle expired credentials
    pass
```

### ID Generation

**TypeScript:**
```typescript
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.getRandomValues(new Uint8Array(5));
  const random = Array.from(randomBytes)
    .map(b => b.toString(36))
    .join('')
    .substring(0, 7);
  return `${prefix}_${timestamp}${random}`;
}
```

**Python:**
```python
import secrets
import time

def generate_id(prefix: str) -> str:
    """Generate unique ID."""
    timestamp = format(int(time.time() * 1000), "x")
    random_str = secrets.token_hex(5)[:7]
    return f"{prefix}_{timestamp}{random_str}"
```

### API Key Generation

**TypeScript:**
```typescript
function generateApiKey(prefix: string = 'ak'): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${key}`;
}
```

**Python:**
```python
import secrets

def generate_api_key(prefix: str = "ak") -> str:
    """Generate a secure API key."""
    random_bytes = secrets.token_bytes(32)
    key = random_bytes.hex()
    return f"{prefix}_{key}"
```

## Database Adapter Protocol

### TypeScript Interface

```typescript
interface Adapter {
  findOne<T>(options: {
    model: string;
    where: WhereClause[];
    namespace: string;
  }): Promise<T | null>;

  findMany<T>(options: {
    model: string;
    where: WhereClause[];
    orderBy?: OrderByClause[];
    namespace: string;
  }): Promise<T[]>;

  create(options: {
    model: string;
    data: Record<string, any>;
    namespace: string;
  }): Promise<void>;

  update(options: {
    model: string;
    where: WhereClause[];
    data: Record<string, any>;
    namespace: string;
  }): Promise<void>;
}
```

### Python Protocol

```python
from typing import Protocol, List, Dict, Any, Optional

class DatabaseAdapter(Protocol):
    """Protocol for database adapters."""

    async def find_one(
        self,
        model: str,
        where: List[WhereClause],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        """Find a single record."""
        ...

    async def find_many(
        self,
        model: str,
        where: List[WhereClause],
        order_by: Optional[List[OrderByClause]],
        namespace: str,
    ) -> List[Dict[str, Any]]:
        """Find multiple records."""
        ...

    async def create(
        self,
        model: str,
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Create a new record."""
        ...

    async def update(
        self,
        model: str,
        where: List[WhereClause],
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Update records."""
        ...
```

## Testing

### TypeScript
- Uses Vitest for testing
- Type-safe mocking

### Python
- Uses pytest with pytest-asyncio
- Comprehensive test coverage
- Type-safe mocking with protocols
- Fixtures for test setup

## Development Tools

### TypeScript
```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

### Python
```toml
[project.optional-dependencies]
dev = [
  "pytest>=7.4.0",
  "pytest-asyncio>=0.21.0",
  "mypy>=1.7.0",
  "ruff>=0.1.6",
  "black>=23.11.0",
]
```

Commands:
```bash
pytest                 # Run tests
mypy authfn           # Type checking
ruff check authfn     # Linting
black authfn          # Code formatting
```

## Key Differences Summary

1. **Type System**: TypeScript uses compile-time only types; Python uses Pydantic for runtime validation
2. **Naming Convention**: TypeScript uses camelCase; Python uses snake_case (with camelCase aliases in Pydantic)
3. **Error Handling**: TypeScript uses try/catch with instanceof; Python uses except with exception types
4. **Package Management**: TypeScript uses npm/package.json; Python uses pip/pyproject.toml
5. **Module System**: TypeScript uses ES modules; Python uses standard imports
6. **Documentation**: TypeScript uses JSDoc; Python uses docstrings
7. **Testing**: TypeScript uses Vitest; Python uses pytest
8. **Async Model**: Both support async/await natively, but with different underlying implementations

## Migration Notes

If migrating from TypeScript to Python:

1. Convert camelCase to snake_case for function/variable names
2. Use Pydantic models instead of TypeScript interfaces
3. Replace `null` with `None`
4. Replace `undefined` with `None` or omit the field
5. Use `Optional[T]` instead of `T | null`
6. Replace `Record<string, any>` with `Dict[str, Any]`
7. Use f-strings instead of template literals
8. Import error classes from `authfn.types` instead of separate packages

## Conclusion

The Python implementation maintains feature parity with the current TypeScript authfn packages while following Python conventions and best practices. Both implementations provide:

- ✅ Type safety (compile-time in TS, compile + runtime in Python)
- ✅ Async/await support
- ✅ Database abstraction
- ✅ Comprehensive error handling
- ✅ Testing infrastructure
- ✅ Documentation and examples
- ✅ Modern tooling (linters, formatters, type checkers)
