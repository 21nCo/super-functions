# Package Structure Guide

## Overview

This document explains the flat, clean structure of superfunctions packages.

## Directory Layout

```
superfunctions/
└── packages/
    ├── TypeScript Packages (prefix: none)
    │   ├── http/
    │   ├── http-express/
    │   ├── http-fastify/
    │   ├── db/
    │   ├── auth/
    │   └── cli/
    │
    └── Python Packages (prefix: python-)
        ├── python-core/
        ├── python-sqlalchemy/
        ├── python-fastapi/
        └── python-flask/
```

## Design Principles

### 1. Flat Structure ✅

**Good:** Minimal nesting
```
packages/
├── http/
├── python-core/
└── python-sqlalchemy/
```

**Bad:** Excessive nesting
```
packages/
└── python/
    └── superfunctions-core/
        └── superfunctions/
            └── db/
```

### 2. Clear Naming ✅

**Folder name = Package identifier**

| Folder | Package | Import |
|--------|---------|--------|
| `python-core/` | `superfunctions` | `from superfunctions.db import ...` |
| `python-sqlalchemy/` | `superfunctions-sqlalchemy` | `from superfunctions_sqlalchemy import ...` |
| `python-fastapi/` | `superfunctions-fastapi` | `from superfunctions_fastapi import ...` |

### 3. Consistent Pattern ✅

**TypeScript:**
```
packages/http/              → @superfunctions/http
packages/http-express/      → @superfunctions/http-express
packages/db/                → @superfunctions/db
```

**Python:**
```
packages/python-core/       → superfunctions
packages/python-sqlalchemy/ → superfunctions-sqlalchemy
packages/python-fastapi/    → superfunctions-fastapi
```

Both follow the same pattern: folder name clearly indicates the package.

## Comparison: Before vs After

### Before (Nested) ❌

```
packages/
└── python/                           # Redundant grouping folder
    ├── superfunctions-core/          # Package folder
    │   └── superfunctions/           # Actual package code
    │       ├── db/
    │       └── http/
    │
    ├── superfunctions-sqlalchemy/    # Package folder
    │   └── superfunctions_sqlalchemy/ # Actual package code
    │       └── adapter.py
    │
    └── superfunctions-fastapi/       # Package folder
        └── superfunctions_fastapi/   # Actual package code
            └── adapter.py
```

**Problems:**
- 4 levels deep to reach code
- Redundant `python/` folder
- Confusing to navigate
- Doesn't match TypeScript structure

### After (Flat) ✅

```
packages/
├── python-core/                 # Package folder
│   └── superfunctions/          # Actual package code
│       ├── db/
│       └── http/
│
├── python-sqlalchemy/           # Package folder
│   └── superfunctions_sqlalchemy/ # Actual package code
│       └── adapter.py
│
└── python-fastapi/              # Package folder
    └── superfunctions_fastapi/  # Actual package code
        └── adapter.py
```

**Benefits:**
- 3 levels deep (1 less!)
- No redundant folders
- Clear naming with `python-` prefix
- Matches TypeScript pattern
- Easy to navigate

## Navigation Examples

### TypeScript Packages
```bash
cd packages/http                # @superfunctions/http
cd packages/http-express        # @superfunctions/http-express
cd packages/db                  # @superfunctions/db
```

### Python Packages
```bash
cd packages/python-core         # superfunctions
cd packages/python-sqlalchemy   # superfunctions-sqlalchemy
cd packages/python-fastapi      # superfunctions-fastapi
```

### Quick Navigation
```bash
# List all packages
ls packages/

# List Python packages only
ls packages/python-*

# List TypeScript HTTP packages
ls packages/http-*
```

## Why Prefix Instead of Folder?

### Option 1: Separate Folder (Bad) ❌
```
packages/
├── typescript/
│   ├── http/
│   └── db/
└── python/
    ├── core/
    └── sqlalchemy/
```

**Problems:**
- Inconsistent (TypeScript has no prefix/folder)
- Breaks alphabetical sorting
- More nesting

### Option 2: Prefix (Good) ✅
```
packages/
├── http/
├── http-express/
├── db/
├── python-core/
├── python-sqlalchemy/
└── python-fastapi/
```

**Benefits:**
- Flat structure
- Clear language indicator
- Alphabetical sorting keeps related packages together
- Easy to filter: `ls packages/python-*`

## Best Practices

### ✅ Do This
1. Keep structure flat (2-3 levels max)
2. Make folder name match package identifier
3. Use prefixes for language distinction
4. Keep related packages together

### ❌ Avoid This
1. Deep nesting (4+ levels)
2. Redundant grouping folders
3. Mismatched folder/package names
4. Separating packages by arbitrary groups

## Summary

| Aspect | Nested Structure | Flat Structure |
|--------|-----------------|----------------|
| **Depth** | 4+ levels | 2-3 levels |
| **Clarity** | Confusing | Clear |
| **Navigation** | Many `cd` commands | Quick access |
| **Consistency** | TypeScript ≠ Python | TypeScript = Python |
| **Maintenance** | Harder | Easier |

The flat structure is:
- ✅ Easier to navigate
- ✅ Clearer to understand
- ✅ Consistent across languages
- ✅ Better for monorepo tools
- ✅ Simpler to document

## References

- [Python Packaging Guide](https://packaging.python.org/en/latest/)
- [Monorepo Best Practices](https://monorepo.tools/)
- Inspired by: Google's monorepo structure
