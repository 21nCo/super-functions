# searchfn

`searchfn` is a browser-first full-text search engine that keeps its index in IndexedDB while caching hot postings in memory. It ships a FlexSearch-compatible adapter so existing applications can migrate without rewriting worker pipelines.

## Features

- 🗄️ **Persistent Storage** - IndexedDB-backed index with automatic persistence
- ⚡ **In-Memory Cache** - LRU caching for hot postings and vectors
- 🧠 **In-Memory Variant** - Lightweight `InMemorySearchFn` for ephemeral data
- 🔄 **Full CRUD Support** - Add, update, remove, and retrieve documents
- 🔍 **BM25 Scoring** - Relevance-based ranking with configurable pipeline
- 🧵 **Worker-Ready** - Snapshot export/import for cross-thread usage
- 🔌 **FlexSearch Compatible** - Drop-in replacement for existing FlexSearch code

## Installation

```bash
npm install searchfn
```

## Quick Start

```ts
import { SearchFn } from "searchfn";

const engine = new SearchFn({
  name: "demo",
  fields: ["title", "body"]
});

await engine.add({
  id: "doc-1",
  fields: {
    title: "Hybrid search",
    body: "IndexedDB persistence with in-memory caching"
  },
  store: { url: "/docs/hybrid-search" }
});

const hits = await engine.searchDetailed("hybrid", { includeStored: true });
console.log(hits[0]);
// { docId: "doc-1", score: 1.23, document: { url: "/docs/hybrid-search" } }

await engine.destroy();
```

## Core API

### SearchFn

#### Constructor

```ts
const engine = new SearchFn({
  name: "my-index",          // Index name (required)
  fields: ["title", "body"], // Searchable fields (required)
  pipeline: {                 // Optional tokenization config
    language: "en",             // Language for stop words/stemming (en/es/fr, default: en)
    enableStemming: true,       // Enable Porter stemming (default: false)
    stopWords: new Set([...])   // Custom stop words (overrides language-based defaults)
  },
  cache: {                    // Optional cache sizes
    terms: 2048,              // LRU cache for term postings (default: 2048)
    vectors: 512              // LRU cache for document vectors (default: 512)
  },
  storage: {                  // Optional IndexedDB config
    dbName: "custom-db",      // Database name (default: searchfn-{name})
    version: 1,               // Schema version (default: 1)
    chunkSize: 256            // Postings chunk size (default: 256)
  }
});
```

#### Adding Documents

```ts
await engine.add({
  id: "doc-1",                // string | number (required)
  fields: {                   // Indexed fields (required)
    title: "Getting Started",
    body: "Full-text search guide"
  },
  store: {                    // Optional metadata (not indexed, but retrievable)
    url: "/guide",
    tags: ["tutorial", "docs"]
  }
});
```

#### Bulk Indexing (Performance Optimization)

For indexing large datasets, use batched persistence to achieve 15-30x speedup:

**Option 1: Manual Flush** (fine-grained control):
```ts
// Accumulate changes in memory
for (const doc of documents) {
  await engine.add({
    id: doc.id,
    fields: doc.fields
  }, { persist: false });  // Skip immediate persistence
}

// Single batch persist at the end
await engine.flush();
```

**Option 2: Bulk Add** (convenience method):
```ts
await engine.addBulk(documents, {
  batchSize: 1000,  // Progress callback interval (optional)
  onProgress: (indexed, total) => {
    console.log(`Indexed ${indexed}/${total} documents`);
  }
});
```

**When to use which approach:**
- Use **manual flush** when you need custom batching logic, conditional persistence, or integration with existing async workflows
- Use **addBulk()** for simple scenarios where you just want progress reporting and automatic batch management

**Performance Comparison:**
- Traditional: `await engine.add(doc)` → ~30-60 seconds for 10,000 docs
- Batched: `await engine.flush()` → ~1-2 seconds for 10,000 docs

**Examples:**
- See [`examples/bulk-indexing-worker.ts`](./examples/bulk-indexing-worker.ts) for real-world usage patterns
- Run [`benchmarks/batched-indexing-benchmark.ts`](./benchmarks/batched-indexing-benchmark.ts) to measure performance on your system

#### Searching

**Basic search** (returns document IDs):
```ts
const ids = await engine.search("getting started", {
  limit: 10,                  // Max results (optional)
  fields: ["title"]           // Limit search to specific fields (optional)
});
// ["doc-1", "doc-5", ...]
```

**Detailed search** (returns scores and stored data):
```ts
const results = await engine.searchDetailed("getting started", {
  limit: 10,
  includeStored: true         // Include stored metadata
});
// [
//   { docId: "doc-1", score: 1.23, document: { url: "/guide", tags: [...] } },
//   ...
// ]
```

#### Removing Documents

```ts
await engine.remove("doc-1");
```

#### Updating Documents

Update by removing and re-adding:
```ts
await engine.remove("doc-1");
await engine.add({
  id: "doc-1",
  fields: { title: "Updated Title", body: "New content" },
  store: { url: "/new-url" }
});
```

#### Retrieving Stored Data

```ts
const doc = await engine.getDocument("doc-1");
// { url: "/new-url" }
```

#### Snapshots

Export and import index state (useful for persistence or worker transfer):
```ts
const snapshot = await engine.exportSnapshot();
await engine.importSnapshot(snapshot);
```

#### Worker Snapshots

JSON-serializable format for `postMessage`:
```ts
const payload = await engine.exportWorkerSnapshot();
worker.postMessage(payload);

// In worker:
await engine.importWorkerSnapshot(payload);
```

#### Cleanup

```ts
await engine.destroy(); // Deletes IndexedDB database
```

## InMemorySearchFn

For scenarios where data is already loaded in memory (e.g., links panel, global graph, collection items), use `InMemorySearchFn` - a lightweight variant without IndexedDB persistence.

### Quick Start

```ts
import { InMemorySearchFn } from "searchfn";

const search = new InMemorySearchFn({
  fields: ["title", "tags"]
});

// Add documents (synchronous)
search.add({
  id: "link-1",
  fields: { title: "Home Page", tags: "navigation main" },
  store: { url: "/", visits: 42 }
});

// Search (synchronous)
const results = search.searchDetailed("home", { includeStored: true });
// [{ docId: "link-1", score: 1.23, document: { url: "/", visits: 42 } }]
```

### API

All methods are **synchronous** and match `SearchFn` API:

```ts
// Add document
search.add({
  id: "doc-1",
  fields: { title: "...", body: "..." },
  store: { custom: "data" }
});

// Search
const ids = search.search("query", { limit: 10, fields: ["title"] });
const detailed = search.searchDetailed("query", { includeStored: true });

// Remove
search.remove("doc-1");

// Get stored data
const doc = search.getDocument("doc-1");

// Clear all
search.clear();

// Snapshot (for serialization/hydration)
const snapshot = search.exportSnapshot();
search.importSnapshot(snapshot);
```

### When to Use

- ✅ In-memory data (UI state, cached lists, navigation items)
- ✅ Temporary search (session-based, ephemeral collections)
- ✅ Fast initialization (no async setup)
- ❌ Large datasets requiring persistence
- ❌ Data that needs to survive page reloads

## FlexSearch Compatibility

### Index Adapter

Drop-in replacement for FlexSearch `Index`:

```ts
import { FlexSearchIndexAdapter } from "searchfn";

const index = new FlexSearchIndexAdapter({
  name: "notes",
  fields: ["text"],
  cache: { term: 1024 }
});

// FlexSearch-compatible methods
await index.addAsync("doc-1", "Quick brown fox");
await index.addDocument({ id: "doc-2", fields: { text: "Lazy dog" } });

const ids = await index.searchAsync("quick");
const cached = await index.searchCacheAsync("fox", { limit: 5 });

await index.removeAsync("doc-1");
await index.clear();

// Worker snapshots
const snapshot = await index.exportWorkerSnapshot();
await index.importWorkerSnapshot(snapshot);
```

### Document Adapter

Multi-field search with schema:

```ts
import { FlexSearchDocumentAdapter } from "searchfn";

const index = new FlexSearchDocumentAdapter({
  name: "articles",
  fields: ["title", "body"],
  document: {
    id: "id",
    index: ["title", "body"],    // Fields to index
    store: ["title", "url"]       // Fields to store (not indexed)
  }
});

await index.add({
  id: "article-1",
  fields: { title: "Hello", body: "World" },
  store: { url: "/hello" }
});

const results = await index.search("hello");
// [{ result: ["article-1"], documents: [{ id: "article-1", score: 1.0, ... }] }]

await index.remove("article-1");
```

## Migrating from v0.1.x to v0.2.0

The main class has been renamed from `SearchEngine` to `SearchFn` for consistency. Backward-compatible exports are provided:

**Old (still works, but deprecated):**
```ts
import { SearchEngine } from "searchfn";
const engine = new SearchEngine({...});
```

**New (recommended):**
```ts
import { SearchFn } from "searchfn";
const engine = new SearchFn({...});
```

**New Features in v0.2.0:**
- `flush()` - Explicit persistence control
- `addBulk()` - Batch indexing with progress callbacks
- `{ persist: false }` option in `add()` - Defer persistence
- 15-30x performance improvement for bulk indexing

## Migration Utilities

Migrate existing FlexSearch data from IndexedDB:

```ts
import { migrateFlexStoreToSearchFn, SearchFn } from "searchfn";

const engine = new SearchFn({
  name: "migrated",
  fields: ["title", "body"]
});

await migrateFlexStoreToSearchFn(engine, legacyFlexStore, {
  indexFields: ["title", "body"],
  storeFields: ["tags", "url"]
});
```

See [`docs/migration-guide.md`](./docs/migration-guide.md) for a full walkthrough.

## Examples

### Basic CRUD Operations

```ts
import { SearchFn } from "searchfn";

const engine = new SearchFn({
  name: "notes",
  fields: ["content"]
});

// Add
await engine.add({
  id: "note-1",
  fields: { content: "Buy groceries" },
  store: { createdAt: Date.now() }
});

// Search
const results = await engine.search("groceries");

// Update
await engine.remove("note-1");
await engine.add({
  id: "note-1",
  fields: { content: "Buy milk and bread" },
  store: { createdAt: Date.now(), updatedAt: Date.now() }
});

// Retrieve
const note = await engine.getDocument("note-1");
console.log(note.updatedAt);

// Delete
await engine.remove("note-1");
```

### Multi-Field Search

```ts
const engine = new SearchFn({
  name: "products",
  fields: ["name", "description", "category"]
});

await engine.add({
  id: "prod-1",
  fields: {
    name: "Wireless Mouse",
    description: "Ergonomic design with USB receiver",
    category: "Electronics"
  },
  store: { price: 29.99, sku: "MOUSE-001" }
});

// Search across all fields
const all = await engine.search("wireless");

// Search specific fields only
const nameOnly = await engine.search("mouse", {
  fields: ["name"]
});
```

### Custom Pipeline

```ts
// English with stemming (default)
const engineEN = new SearchFn({
  name: "english",
  fields: ["text"],
  pipeline: {
    language: "en",           // or "english"
    enableStemming: true
  }
});

// Spanish stop words
const engineES = new SearchFn({
  name: "spanish",
  fields: ["text"],
  pipeline: {
    language: "es"            // or "spanish"
  }
});

// French stop words
const engineFR = new SearchFn({
  name: "french",
  fields: ["text"],
  pipeline: {
    language: "fr"            // or "french"
  }
});

// Custom stop words (overrides language defaults)
const engineCustom = new SearchFn({
  name: "custom",
  fields: ["text"],
  pipeline: {
    stopWords: new Set(["the", "a", "an", "and", "or", "but"])
  }
});
```

## Architecture

**searchfn** persists its inverted index in IndexedDB while maintaining hot data in LRU caches for low-latency queries.

### Storage Layout

- **metadata**: Schema, field definitions, pipeline config
- **terms**: Posting lists keyed by `[field, term, chunk]` with doc frequencies
- **vectors**: Sparse document-field vectors for BM25 scoring
- **documents**: Stored metadata (not indexed, retrievable via `getDocument`)
- **cacheState**: Captured cache entries for warm start

### Data Flow

```
Documents → Pipeline → Indexer → IndexedDB
                              ↘ LRU Cache ↗
                        Query Engine ← Search queries
```

See [`docs/spec.md`](./docs/spec.md) for detailed architecture.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Run specific test file
npx vitest run __tests__/search-engine.test.ts
```

## Building

```bash
# Build for production
npm run build

# Watch mode
npm run build:watch

# Lint and typecheck
npm run lint
npm run typecheck
```

## Benchmarks

```bash
npm run benchmark
```

## Documentation

- [Architecture & Design](./docs/spec.md)
- [Migration Guide](./docs/migration-guide.md)
- [Development Tasks](./docs/task-list.md)

## License

MIT


## Prefix Search & Autocomplete

Enable edge n-grams for prefix matching and autocomplete functionality:

```ts
import { InMemorySearchFn } from 'searchfn';

const autocomplete = new InMemorySearchFn({
  fields: ['name', 'description'],
  pipeline: {
    enableEdgeNGrams: true,
    edgeNGramMinLength: 2,
    edgeNGramMaxLength: 15,
    stopWords: [] // Keep all terms for better autocomplete
  }
});

// Index data
autocomplete.add({
  id: '1',
  fields: { name: 'Anthropic Claude' },
  store: { url: '/anthropic' }
});

// Progressive search as user types
autocomplete.search('an');    // Matches 'Anthropic'
autocomplete.search('anth');  // Still matches
autocomplete.search('anthropic'); // Exact match (higher score)
```

## Fuzzy Search

Handle typos and spelling variations with fuzzy matching:

```ts
const search = new InMemorySearchFn({
  fields: ['title']
});

search.add({ id: '1', fields: { title: 'anthropic' } });

// Without fuzzy - no match
search.search('anthopric'); // []

// With fuzzy - matches within edit distance
search.search('anthopric', { fuzzy: 2 }); // ['1']
search.search('anthopric', { fuzzy: true }); // ['1'] (default distance=2)
```

**Fuzzy Options:**
- `fuzzy: true` - Use default edit distance of 2
- `fuzzy: number` - Custom Levenshtein distance (1-3 recommended, automatically capped at 3)
- Exact matches always rank higher than fuzzy matches

**⚠️ Performance Note:**
Fuzzy search scans the entire vocabulary on every query. For large indices (>10,000 terms), this can introduce noticeable latency. Consider:
- Limiting search scope with `fields` option
- Using prefix matching instead for autocomplete scenarios
- Combining with `minScore` threshold to reduce result set size

## Combining Prefix + Fuzzy

Use both for powerful autocomplete with typo tolerance:

```ts
const search = new InMemorySearchFn({
  fields: ['text'],
  pipeline: {
    enableEdgeNGrams: true,
    edgeNGramMinLength: 2,
    edgeNGramMaxLength: 10
  }
});

// Prefix matching + fuzzy matching
search.search('antho', { fuzzy: 1 });
```


