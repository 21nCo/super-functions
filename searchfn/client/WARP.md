# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## commands

### build
```bash
npm run build
```
Build using tsup. Outputs to `dist/` with CJS, ESM, and TypeScript declarations.

Watch mode:
```bash
npm run build:watch
```

### test
```bash
npm test
```
Run all tests with Vitest. Tests use `fake-indexeddb` to mock browser IndexedDB APIs.

Watch mode:
```bash
npm run test:watch
```

Run single test file:
```bash
npx vitest run __tests__/search-engine.test.ts
```

### lint and typecheck
```bash
npm run lint
npm run typecheck
```
Both must pass before publishing. ESLint uses TypeScript type-aware rules.

Auto-fix linting issues:
```bash
npm run lint:fix
```

### benchmark
```bash
npm run benchmark
```
Run indexing benchmarks via `tsx benchmarks/indexing-benchmark.ts`.

### clean
```bash
npm run clean
```
Remove `dist/` directory.

## architecture

**searchfn** is a browser-first full-text search engine that persists its index in IndexedDB while caching hot postings in memory. It provides FlexSearch-compatible adapters for drop-in replacement in applications like `tidigit`.

### core components

#### 1. **SearchFn** (`src/search-engine.ts`)
The main entry point. Orchestrates indexing, querying, and persistence.
- Constructor accepts `{ name, fields, pipeline?, storage?, cache? }`
- Methods: `add()`, `search()`, `searchDetailed()`, `remove()`, `destroy()`
- Worker-friendly: `exportWorkerSnapshot()` and `importWorkerSnapshot()` for transferring index state across threads

#### 2. **Storage Layer** (`src/storage/`)
`IndexedDbManager` wraps all IndexedDB interactions with async methods.

Object stores:
- `metadata`: schema, field definitions, pipeline config
- `terms`: composite key `[field, term, chunk]` with posting arrays + metrics
- `vectors`: doc-field sparse vectors for scoring
- `documents`: stored original snippets/fields
- `cacheState`: captured hot entries for warm start

Posting lists are delta-encoded and chunked (default 256 IDs per chunk) for efficient storage and retrieval.

#### 3. **Cache Layer** (`src/cache/`)
LRU caches for term postings and document vectors.
- Configurable via `cache.terms` and `cache.vectors` options
- Defaults: 2048 term entries, 512 vector entries
- `LruCache` implements O(1) insert/eviction via doubly-linked map

#### 4. **Pipeline Service** (`src/pipeline/`)
`PipelineEngine` handles tokenization, normalization, stop-word removal.
- Stages: lowercase → split → stop-word filter
- Configurable via `pipeline` option in constructor
- Serialized into metadata for consistent rehydration

#### 5. **Indexer** (`src/indexing/`)
`Indexer` processes documents through the pipeline and generates term frequencies.
- `ingest()` method returns field-term frequency maps
- Updates in-memory posting lists before persistence

#### 6. **Query Engine** (`src/query/`)
`QueryEngine` orchestrates search execution.
- Fetches postings from cache or IndexedDB
- BM25-inspired scoring using cached IDF values
- `DocumentStatsManager` tracks document lengths for scoring

### compatibility layer (`src/compat/`)

Provides FlexSearch-compatible adapters:

#### **FlexSearchIndexAdapter**
Drop-in replacement for FlexSearch's `Index` class.
- Methods: `addAsync()`, `searchAsync()`, `searchCacheAsync()`, `removeAsync()`, `clear()`
- Worker snapshots: `exportWorkerSnapshot()`, `importWorkerSnapshot()`

#### **FlexSearchDocumentAdapter**
Multi-field search adapter (not shown in detail, but follows same pattern)

#### **Migration utilities** (`src/compat/migration.ts`)
`migrateFlexStoreToSearchFn()` helper for migrating existing FlexSearch data from IndexedDB.

### data flow

```
Documents → PipelineEngine → Indexer → IndexedDbManager (persistence)
                                      ↘ LruCache (hot data) ↗
                             QueryEngine ← Search queries
```

## development notes

### testing
- All tests use `fake-indexeddb` to simulate browser IndexedDB
- Test files in `__tests__/` mirror source structure
- Integration tests in `search-engine.test.ts` and `compat.test.ts` cover end-to-end flows

### TypeScript
- Strict mode enabled
- Target: ES2021 with DOM libs
- Module resolution: Bundler
- All types exported from `src/types.ts` and component-specific type files

### build output
- `dist/index.cjs` - CommonJS bundle
- `dist/index.mjs` - ESM bundle  
- `dist/index.d.ts` - TypeScript declarations
- Exports configured for dual module support in `package.json`

### key patterns
- All storage operations are async and wrapped in IndexedDB transactions
- Posting lists are chunked and delta-encoded for compression
- Cache-first query strategy: check LRU cache before hitting IndexedDB
- Worker snapshots use serializable JSON payloads (not raw ArrayBuffers) for `postMessage` compatibility

## integration with tidigit

This library was designed to replace FlexSearch in the `tidigit` repository:
- Use `FlexSearchIndexAdapter` as drop-in replacement for FlexSearch's `Index`
- Adapters match FlexSearch method signatures: `addAsync`, `removeAsync`, `searchCacheAsync`, etc.
- Worker export/import flows integrate with `dexie.indexing.worker.ts` patterns
- See `docs/migration-guide.md` for step-by-step migration instructions

## documentation

- `README.md` - installation, quick start, examples
- `docs/spec.md` - detailed architecture and design decisions
- `docs/migration-guide.md` - FlexSearch → searchfn migration walkthrough
- `docs/action-plan.md` - implementation roadmap
- `docs/task-list.md` - development task tracking
