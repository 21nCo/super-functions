# Changelog

## 0.2.0 - 2026-03-11

### Breaking Changes

- Removed the legacy aggregate adapters package.
- Split adapters into dedicated packages:
  - `@searchfn/adapter-contracts`
  - `@searchfn/adapter-memory`
  - `@searchfn/adapter-indexeddb`
  - `@searchfn/adapter-postgres`
  - `@searchfn/adapter-meilisearch`
  - `@searchfn/adapter-elasticsearch`
  - `@searchfn/adapter-opensearch`

### Migration Guide

#### Package dependency mapping

| Old | New |
| --- | --- |
| `legacy aggregate adapters package` | `@searchfn/adapter-memory` |
| `legacy aggregate adapters package` | `@searchfn/adapter-indexeddb` |
| `legacy aggregate adapters package` | `@searchfn/adapter-postgres` |
| `legacy aggregate adapters package` | `@searchfn/adapter-meilisearch` |
| `legacy aggregate adapters package` | `@searchfn/adapter-elasticsearch` |
| `legacy aggregate adapters package` | `@searchfn/adapter-opensearch` |

#### Import mapping

| Old import | New import |
| --- | --- |
| `import { MemoryAdapter } from "<legacy-adapters-package>"` | `import { MemoryAdapter } from "@searchfn/adapter-memory"` |
| `import { IndexedDbAdapter } from "<legacy-adapters-package>"` | `import { IndexedDbAdapter } from "@searchfn/adapter-indexeddb"` |
| `import { PostgresAdapter } from "<legacy-adapters-package>"` | `import { PostgresAdapter } from "@searchfn/adapter-postgres"` |
| `import { MeilisearchAdapter } from "<legacy-adapters-package>"` | `import { MeilisearchAdapter } from "@searchfn/adapter-meilisearch"` |
| `import { ElasticsearchAdapter } from "<legacy-adapters-package>"` | `import { ElasticsearchAdapter } from "@searchfn/adapter-elasticsearch"` |
| `import { OpenSearchAdapter } from "<legacy-adapters-package>"` | `import { OpenSearchAdapter } from "@searchfn/adapter-opensearch"` |
