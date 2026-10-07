# searchfn

Python kernel for inverted-index full-text search. It tokenizes string fields, writes terms into a table on a duck-typed db adapter, and ranks results by matching index-row count.

The kernel does not import DataFn. Tests use a local `FakeDb`. Any object with async `find_many`, `create`, and `delete` works. A DataFn `Adapter` (`datafn.db.Adapter`) uses those same method names if you already have one.

## Installation

From this package directory (CI discovers `searchfn/python` from the monorepo root):

```bash
pip install -e .
```

## Quick start

```python
from searchfn import create_searchfn_server

schema = {
    "models": {
        "article": {
            "fields": {
                "title": {"type": "string"},
                "views": {"type": "number"},
            }
        }
    }
}

class FakeDb:
    def __init__(self):
        self.records = {
            "article": [
                {"id": "1", "title": "Hello Search"},
                {"id": "2", "title": "Search Search World"},
            ],
            "_searchfn_index": [],
        }

    async def find_many(self, table, where, limit=None):
        rows = list(self.records.get(table, []))
        for clause in where:
            rows = [row for row in rows if row.get(clause["field"]) == clause["value"]]
        return rows[:limit] if limit is not None else rows

    async def create(self, table, value):
        self.records.setdefault(table, []).append(value)
        return value

    async def delete(self, table, where):
        rows = self.records.get(table, [])
        self.records[table] = [
            row
            for row in rows
            if not all(row.get(clause["field"]) == clause["value"] for clause in where)
        ]

db = FakeDb()

plugin = create_searchfn_server({
    "schema": schema,
    "db": db,
    "table_prefix": "_searchfn_",  # optional
})
routes = plugin["routes"]
```

`create_searchfn_server` returns a dict with a `routes` key. Mount those handlers in your HTTP framework if you want the endpoints below.

### Index

```python
import asyncio
from searchfn import index_data

asyncio.run(index_data(schema, db, model="article"))
```

Or `POST /searchfn/index` with `{ "model": "article" }`.

### Search

```python
import asyncio
from searchfn import search_index

results = asyncio.run(search_index(schema, db, query="search world"))
for res in results:
    print(f"Found {res['id']} in {res['model']} (Score: {res['score']})")
```

Or `POST /searchfn/search` with `{ "query": "search world", "limit": 10 }`.

## API

### `create_searchfn_server(config)`

- `schema` (required): dict with `models` or `resources` whose fields include `{ "type": "string" }`.
- `db` (required): duck-typed adapter (`find_many`, `create`, `delete`).
- `table_prefix` (optional): prefix for the index table (default `_searchfn_`).

Returns `{ "routes": { "POST /searchfn/index": ..., "POST /searchfn/search": ... } }`.

### HTTP endpoints

#### `POST /searchfn/index`

- Payload: `{ "model": "optional_name" }`
- Response: `{ "ok": true, "result": { "totalIndexed": 123, "totalTerms": 456 } }`

#### `POST /searchfn/search`

- Payload: `{ "query": "text", "model": "optional_filter", "limit": 20 }`
- Response: `{ "ok": true, "results": [...] }`

### Core functions

#### `index_data(schema, db, model=None, table_prefix="_searchfn_")`

Scans records for the given model (or all models) and writes tokens into `{table_prefix}index`.

#### `search_index(schema, db, query, model=None, limit=20, table_prefix="_searchfn_")`

Tokenizes the query and returns matches sorted by score.

## How it works

SearchFn keeps a simple inverted index (default table `_searchfn_index`):

1. Tokenization splits text, lowercases it, and strips punctuation.
2. Index rows map `term` → `recordId`.
3. Results are ranked by matching index rows. Repeated occurrences and matches
   across multiple fields each contribute to the score; `matches` lists the
   distinct query terms that matched.

## License

MIT
