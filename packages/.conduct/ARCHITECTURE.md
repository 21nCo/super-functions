# Shared Packages Architecture

## Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPERFUNCTIONS PACKAGES                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐
│   TypeScript Packages    │  │    Python Packages       │
├──────────────────────────┤  ├──────────────────────────┤
│ @superfunctions/http     │  │ superfunctions-http      │
│ @superfunctions/db       │  │ superfunctions-db        │
│ @superfunctions/auth     │  │                          │
│ @superfunctions/cli      │  │                          │
└──────────────────────────┘  └──────────────────────────┘
           ↓                              ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│   Framework Adapters     │  │    ORM/Framework         │
├──────────────────────────┤  │    Adapters (Soon)       │
│ Express, Fastify         │  ├──────────────────────────┤
│ Hono, Next.js            │  │ SQLAlchemy (TODO)        │
│ SvelteKit                │  │ Django ORM (TODO)        │
│                          │  │ Tortoise (TODO)          │
│ Drizzle, Prisma          │  │ FastAPI (TODO)           │
│ Kysely, MongoDB          │  │ Flask (TODO)             │
└──────────────────────────┘  └──────────────────────────┘
           ↓                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      SUPERFUNCTIONS LIBRARIES                            │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│ authfn                   │ plugfn                   │ secfn            │
│ - TypeScript ✅          │ - TypeScript ✅          │ - TypeScript ✅  │
│ - Python ⚠️              │ - Python ⚠️              │ - Python ⚠️      │
├──────────────────────────┼──────────────────────────┼──────────────────┤
│ botfn                    │ searchfn                 │ testfn           │
│ - TypeScript ✅          │ - TypeScript ✅          │ - TypeScript ✅  │
└──────────────────────────┴──────────────────────────┴──────────────────┘

✅ = Fully integrated with shared packages
⚠️  = Optional support with backwards compatibility
```

## Package Dependency Flow

### TypeScript Flow

```
┌─────────────────┐
│   User's App    │
└────────┬────────┘
         ↓
┌─────────────────┐
│  authfn/botfn/  │  ← Your library choice
│  searchfn/etc   │
└────────┬────────┘
         ↓
┌────────────────────────────────┐
│  @superfunctions/db            │  ← Shared database layer
│  - Adapter protocol            │
│  - CRUD operations             │
│  - Transaction support         │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│  ORM Adapter                   │  ← Framework specific
│  (Drizzle/Prisma/Kysely/etc)   │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│  Database                      │
│  (PostgreSQL/MySQL/SQLite/etc) │
└────────────────────────────────┘
```

### Python Flow (New)

```
┌─────────────────┐
│   User's App    │
└────────┬────────┘
         ↓
┌─────────────────┐
│  authfn/plugfn/ │  ← Your library choice
│  secfn/etc      │
└────────┬────────┘
         ↓
┌────────────────────────────────┐
│  Package Bridge Adapter        │  ← Backwards compat layer
│  (SuperfunctionsDbAdapter)     │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│  superfunctions-db             │  ← Shared database layer
│  - Adapter protocol            │
│  - CRUD operations             │
│  - Transaction support         │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│  ORM Adapter (Coming Soon)     │  ← Framework specific
│  (SQLAlchemy/Django/Tortoise)  │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│  Database                      │
│  (PostgreSQL/MySQL/SQLite/etc) │
└────────────────────────────────┘
```

## Code Comparison: Before vs After

### Before: Duplicate Code

```
authfn/python/types.py:
┌──────────────────────────┐
│ class WhereClause        │
│ class DatabaseAdapter    │
│ ... 50 lines ...         │
└──────────────────────────┘

plugfn/python/types.py:
┌──────────────────────────┐
│ class WhereClause        │  ← Duplicate!
│ class DatabaseAdapter    │  ← Duplicate!
│ ... 50 lines ...         │
└──────────────────────────┘

secfn/python/types.py:
┌──────────────────────────┐
│ class WhereClause        │  ← Duplicate!
│ class DatabaseAdapter    │  ← Duplicate!
│ ... 50 lines ...         │
└──────────────────────────┘

Total: 150+ lines duplicated
Issues: 
- Bug fixes need 3 places
- Features added 3 times
- Inconsistent behavior
```

### After: Shared Packages

```
packages/py-db/superfunctions_db/:
┌──────────────────────────────────┐
│ adapter/types.py:                │
│ - class Adapter (Protocol)       │
│ - class WhereClause (Pydantic)   │
│ - class CreateParams             │
│ - ... 200 lines comprehensive    │
│                                  │
│ adapter/errors.py:               │
│ - AdapterError hierarchy         │
│ - Structured error handling      │
│                                  │
│ utils/namespace.py:              │
│ - NamespaceManager               │
│ - Multi-tenant support           │
└──────────────────────────────────┘
          ↓ import
┌──────────────────────────────────┐
│ authfn/python/adapter.py:        │
│ - SuperfunctionsDbAdapter (20)   │  ← Bridge adapter
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ plugfn/python/adapter.py:        │
│ - SuperfunctionsDbAdapter (20)   │  ← Bridge adapter
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ secfn/python/adapter.py:         │
│ - SuperfunctionsDbAdapter (20)   │  ← Bridge adapter
└──────────────────────────────────┘

Total: ~260 lines, zero duplication
Benefits:
- Single source of truth
- Bug fix once, everywhere
- Consistent behavior
- Better tested
```

## Type System Comparison

### TypeScript

```typescript
// Protocol definition
interface Adapter {
  create<T>(params: CreateParams): Promise<T>;
  findOne<T>(params: FindOneParams): Promise<T | null>;
  findMany<T>(params: FindManyParams): Promise<T[]>;
  update<T>(params: UpdateParams): Promise<T>;
  delete(params: DeleteParams): Promise<void>;
  // ... more methods
}

// Usage
const adapter: Adapter = createDrizzleAdapter({ db });
const user = await adapter.create({
  model: 'users',
  data: { name: 'Alice' }
});
```

### Python

```python
# Protocol definition
class Adapter(Protocol):
    async def create(self, params: CreateParams) -> Dict[str, Any]:
        ...
    async def find_one(self, params: FindOneParams) -> Optional[Dict[str, Any]]:
        ...
    async def find_many(self, params: FindManyParams) -> List[Dict[str, Any]]:
        ...
    async def update(self, params: UpdateParams) -> Dict[str, Any]:
        ...
    async def delete(self, params: DeleteParams) -> None:
        ...
    # ... more methods

# Usage
adapter: Adapter = create_sqlalchemy_adapter(engine)
user = await adapter.create(
    CreateParams(
        model="users",
        data={"name": "Alice"}
    )
)
```

## Query Syntax Unification

### Before: Inconsistent

```python
# authfn had this:
where = [{"field": "email", "operator": "eq", "value": "..."}]

# plugfn had this:
where = [WhereClause(field="email", op="equals", val="...")]

# secfn had this:
filters = {"email": "..."}
```

### After: Consistent

```python
# Everyone uses the same:
from superfunctions_db import WhereClause, Operator

where = [
    WhereClause(field="email", operator=Operator.EQ, value="...")
]
```

## Migration Strategy

### Phase 1: Create Foundation ✅

```
1. ✅ Create packages/py-db
2. ✅ Create packages/py-http
3. ✅ Define protocols and types
4. ✅ Write documentation
```

### Phase 2: Add Bridges ✅

```
1. ✅ Add adapter.py to authfn
2. ✅ Add adapter.py to plugfn
3. ✅ Add adapter.py to secfn
4. ✅ Optional dependencies in pyproject.toml
5. ✅ Backwards compatibility maintained
```

### Phase 3: Implement Adapters (Next)

```
1. 📝 Implement SQLAlchemy adapter
2. 📝 Implement Django ORM adapter
3. 📝 Implement Tortoise adapter
4. 📝 Implement FastAPI HTTP adapter
5. 📝 Implement Flask HTTP adapter
```

### Phase 4: Migrate Internals (Future)

```
1. 📋 Migrate authfn to use superfunctions-db internally
2. 📋 Migrate plugfn to use superfunctions-db internally
3. 📋 Migrate secfn to use superfunctions-db internally
4. 📋 Remove legacy code
```

## File Organization

```
superfunctions/
├── packages/
│   ├── py-db/                           # Python DB package
│   │   ├── superfunctions_db/
│   │   │   ├── __init__.py
│   │   │   ├── adapter/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── types.py            # Core types & protocols
│   │   │   │   └── errors.py           # Error classes
│   │   │   └── utils/
│   │   │       ├── __init__.py
│   │   │       └── namespace.py        # Namespace management
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   ├── py-http/                         # Python HTTP package
│   │   ├── superfunctions_http/
│   │   │   ├── __init__.py
│   │   │   ├── types.py                # Request/Response types
│   │   │   └── middleware/
│   │   │       └── __init__.py
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   ├── PYTHON_PACKAGES.md              # Python docs
│   ├── QUICK_START.md                   # Quick start guide
│   └── README.md                        # Overview
│
├── authfn/python/
│   └── authfn/
│       ├── adapter.py                   # Bridge to superfunctions-db
│       └── ...                          # Existing code
│
├── plugfn/python/
│   └── plugfn/
│       ├── adapter.py                   # Bridge to superfunctions-db
│       └── ...                          # Existing code
│
└── secfn/python/
    └── secfn/
        ├── adapter.py                   # Bridge to superfunctions-db
        └── ...                          # Existing code
```

## Benefits Visualization

```
┌──────────────────────────────────────────────────────────────┐
│                    BEFORE SHARED PACKAGES                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Duplication:    ████████████████ (High)                    │
│  Consistency:    ████░░░░░░░░░░░░ (Low)                     │
│  Maintainability: ██████░░░░░░░░░░ (Medium)                 │
│  Test Coverage:  ████░░░░░░░░░░░░ (Low)                     │
│  Documentation:  ██████░░░░░░░░░░ (Medium)                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    AFTER SHARED PACKAGES                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Duplication:    ░░░░░░░░░░░░░░░░ (None)                    │
│  Consistency:    ████████████████ (High)                    │
│  Maintainability: ████████████████ (High)                   │
│  Test Coverage:  ██████████████░░ (High)                    │
│  Documentation:  ████████████████ (High)                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Next Steps

### Immediate Actions
1. Review the created packages
2. Test backwards compatibility
3. Publish to PyPI (test first)

### Short-term Goals
1. Implement SQLAlchemy adapter
2. Create example applications
3. Add comprehensive tests
4. Gather community feedback

### Long-term Vision
1. Rich ecosystem of adapters
2. Community-contributed implementations
3. Performance optimizations
4. Advanced features (caching, etc.)

## Summary

The shared packages architecture provides:

- ✅ **Zero duplication** of database/HTTP code
- ✅ **Consistent APIs** across all packages
- ✅ **Better maintainability** with centralized code
- ✅ **Type safety** with protocols and Pydantic
- ✅ **Backwards compatibility** for existing users
- ✅ **Future-ready** for new adapters and features

This mirrors the successful TypeScript architecture while respecting Python conventions and maintaining backwards compatibility.
