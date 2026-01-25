# Superfunctions Packages

Shared packages for the superfunctions ecosystem - both TypeScript and Python.

## Structure

```
packages/
├── TypeScript Packages (npm)
│   ├── http/                    # @superfunctions/http
│   ├── http-express/            # @superfunctions/http-express
│   ├── http-fastify/            # @superfunctions/http-fastify
│   ├── http-hono/               # @superfunctions/http-hono
│   ├── http-next/               # @superfunctions/http-next
│   ├── http-sveltekit/          # @superfunctions/http-sveltekit
│   ├── db/                      # @superfunctions/db
│   ├── auth/                    # @superfunctions/auth
│   └── cli/                     # @superfunctions/cli
│
└── Python Packages (PyPI)
    ├── python-core/             # superfunctions (namespace package)
    ├── python-sqlalchemy/       # superfunctions-sqlalchemy
    ├── python-fastapi/          # superfunctions-fastapi
    └── python-flask/            # superfunctions-flask
```

## Why This Structure?

### Flat is Better Than Nested
- ✅ Easy navigation: `packages/python-core/` vs `packages/python/superfunctions-core/`
- ✅ Clear naming: Package folder matches package name
- ✅ Less nesting: Fewer `cd` commands to navigate
- ✅ Consistent: Mirrors TypeScript package layout

### TypeScript Packages
```
packages/http/           → @superfunctions/http
packages/http-express/   → @superfunctions/http-express
packages/db/             → @superfunctions/db
```

### Python Packages
```
packages/python-core/        → superfunctions (imports: superfunctions.db, superfunctions.http)
packages/python-sqlalchemy/  → superfunctions-sqlalchemy
packages/python-fastapi/     → superfunctions-fastapi
packages/python-flask/       → superfunctions-flask
```

## Installation

### TypeScript
```bash
npm install @superfunctions/http @superfunctions/http-express
npm install @superfunctions/db
```

### Python
```bash
pip install superfunctions
pip install superfunctions-sqlalchemy superfunctions-fastapi
```

## Usage

### TypeScript
```typescript
import { createRouter } from '@superfunctions/http';
import { createExpressAdapter } from '@superfunctions/http-express';
import { createDrizzleAdapter } from '@superfunctions/db/adapters';
```

### Python
```python
from superfunctions.db import Adapter, CreateParams
from superfunctions.http import Request, Response
from superfunctions_sqlalchemy import create_adapter
from superfunctions_fastapi import create_router
```

## Package Contents

### Core Packages

**TypeScript:**
- `http/` - HTTP abstractions
- `db/` - Database adapters

**Python:**
- `python-core/` - Both HTTP and DB abstractions in one namespace package

### Adapter Packages

**TypeScript HTTP:**
- `http-express/` - Express.js adapter
- `http-fastify/` - Fastify adapter
- `http-hono/` - Hono adapter
- `http-next/` - Next.js adapter
- `http-sveltekit/` - SvelteKit adapter

**Python HTTP:**
- `python-fastapi/` - FastAPI adapter
- `python-flask/` - Flask adapter

**TypeScript DB:**
- `db/adapters/drizzle/` - Drizzle ORM (in main package)
- `db/adapters/prisma/` - Prisma (in main package)
- `db/adapters/kysely/` - Kysely (in main package)

**Python DB:**
- `python-sqlalchemy/` - SQLAlchemy adapter
- `python-django/` - Django ORM (coming soon)
- `python-tortoise/` - Tortoise ORM (coming soon)

## Benefits of This Structure

1. **Easy to Find**: Package name = folder name
2. **Clear Separation**: TypeScript and Python packages clearly distinguished
3. **Less Nesting**: Flat structure is easier to navigate
4. **Consistent**: Same pattern for all packages
5. **Scalable**: Easy to add new adapters

## Documentation

- [Python Packages Guide](python-core/README.md)
- [Python Adapters](PYTHON_ADAPTERS.md)
- [Quick Start](QUICK_START.md)

## License

MIT
