# searchfn

A lightweight, database-backed full-text search engine SDK for Python, designed as a companion plugin for **DataFn**.

It enables full-text search capabilities over your DataFn models by leveraging your existing database connection to store and query inverted indices.

## Features

- **Database Agnostic**: Works with any DataFn-compatible DB adapter (Postgres, SQLite, etc.).
- **Automatic Indexing**: Scans your DataFn schema to identify and index string fields.
- **Easy Integration**: Provides a pluggable server dictionary compliant with the SuperFunctions HTTP abstraction.
- **Pythonic API**: Direct access to indexing and search functions for background tasks.

## Installation

```bash
pip install searchfn
```

## Quick Start

### 1. Setup

Initialize the SearchFn server configuration alongside your DataFn setup.

```python
from searchfn import create_searchfn_server
from datafn.db import PostgresAdapter
from my_app.schema import schema  # Your DataFn schema dict

# 1. Initialize Adapter
db = PostgresAdapter("postgresql://user:pass@localhost/db")

# 2. Create SearchFn Server Plugin
search_plugin = create_searchfn_server({
    "schema": schema,
    "db": db,
    "table_prefix": "_searchfn_"  # Optional
})

# 3. Integrate with your HTTP Framework
# The `search_plugin` returns a dict with a "routes" key mapping paths to handlers.
# You can mount these in your application (FastAPI, Flask, etc.)
routes = search_plugin["routes"]
```

### 2. Indexing Data

You can trigger indexing via the HTTP endpoint or programmatically.

**Via HTTP:**
```bash
curl -X POST http://localhost:8000/searchfn/index \
  -H "Content-Type: application/json" \
  -d '{ "model": "products" }'
```

**Programmatically:**
```python
import asyncio
from searchfn import index_data

async def run_indexing():
    await index_data(schema, db, model="products")

asyncio.run(run_indexing())
```

### 3. Searching

**Via HTTP:**
```bash
curl -X POST http://localhost:8000/searchfn/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "fast laptop", "limit": 10 }'
```

**Programmatically:**
```python
import asyncio
from searchfn import search_index

async def do_search():
    results = await search_index(schema, db, query="fast laptop")
    for res in results:
        print(f"Found {res['id']} in {res['model']} (Score: {res['score']})")

asyncio.run(do_search())
```

## API Reference

### `create_searchfn_server(config)`

Creates the server plugin definitions.

**Arguments:**
- `config` (dict):
    - `schema` (required): The DataFn schema object/dict.
    - `db` (required): An initialized DB adapter instance.
    - `table_prefix` (optional): String prefix for internal tables (default: `_searchfn_`).

**Returns:**
- A dictionary containing `routes`.

### HTTP Endpoints

#### `POST /searchfn/index`
Triggers indexing.
- **Payload**: `{ "model": "optional_name" }`
- **Response**: `{ "ok": true, "result": { "totalIndexed": 123 } }`

#### `POST /searchfn/search`
Performs a search.
- **Payload**: `{ "query": "text", "model": "optional_filter", "limit": 20 }`
- **Response**: `{ "ok": true, "results": [...] }`

### Core Functions

#### `index_data(schema, db, model=None, table_prefix="_searchfn_")`
Scans database records for the given model (or all models) and populates the index table.

#### `search_index(schema, db, query, model=None, limit=20, table_prefix="_searchfn_")`
Tokenizes the query, retrieves matching records from the index, and returns them sorted by relevance score.

## How it Works

SearchFn maintains a simple **Inverted Index** in your database (default table: `_searchfn_index`).

1. **Tokenization**: It splits text into tokens, lowercases them, and removes punctuation.
2. **Index Table**: Stores rows mapping `term` -> `recordId`.
3. **Scoring**: Search results are ranked by the number of matching tokens found for a record.

This solution is ideal for:
- Prototyping and MVPs.
- Applications with moderate dataset sizes (tens to hundreds of thousands of records).
- Environments where adding a dedicated search service (Elasticsearch/Solr) is overkill.

## License

MIT
