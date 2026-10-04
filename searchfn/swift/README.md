# SearchFn Swift

`searchfn/swift` is a standalone Swift Package Manager package for local full-text search. It ships a built-in search engine, adapter contracts, an in-memory adapter, a SearchFn-owned SQLite adapter, a validating client, and thin convenience APIs. It does not depend on DataFn.

## Package Layout

| Product | Purpose |
| --- | --- |
| `SearchFnCore` | Tokenization, stemming, prefix indexing, fuzzy expansion, BM25-style scoring |
| `SearchFnAdapterContracts` | Shared types, defaults, capabilities, errors, diagnostics events |
| `SearchFnMemoryAdapter` | In-process adapter backed by the built-in engine |
| `SearchFnSQLiteAdapter` | Persistent adapter backed by SearchFn-owned SQLite state |
| `SearchFnClient` | Validating client with defaults handling and deterministic `searchAll` fallback |
| `SearchFnConvenience` | `InMemorySearchFn` and `SearchFn(sqlite:)` convenience wrappers |

## Build From Repo Root

```bash
swift test --package-path searchfn/swift
swift build --package-path searchfn/swift --target SearchFnInMemoryExample
swift build --package-path searchfn/swift --target SearchFnSQLiteExample
```

## In-Memory Quick Start

```swift
import SearchFnConvenience
import SearchFnAdapterContracts

let search = InMemorySearchFn(
    defaults: SearchFnDefaults(
        limit: 20,
        limitPerResource: 10,
        fuzzy: .enabled,
        prefix: true
    )
)

let client = search.client()

try await client.initialize(
    SearchFnInitializeParams(
        resources: [
            SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title", "body"])
        ]
    )
)

try await client.index(
    SearchFnIndexParams(
        resource: "tasks",
        documents: [
            SearchFnDocument(id: "t1", fields: ["title": "Hybrid search", "body": "Swift local index"]),
            SearchFnDocument(id: "t2", fields: ["title": "Groceries", "body": "Milk and bread"])
        ]
    )
)

let ids = try await client.search(
    SearchFnSearchParams(resource: "tasks", query: "hybrid")
)

let allResults = try await client.searchAll(
    SearchFnSearchAllParams(query: "milk", resources: ["tasks"])
)

try await client.remove(resource: "tasks", ids: ["t2"])
try await client.clear(resource: "tasks")
try await client.dispose()
```

## SQLite Quick Start

```swift
import Foundation
import SearchFnConvenience
import SearchFnSQLiteAdapter

let rootURL = FileManager.default.temporaryDirectory
    .appendingPathComponent("searchfn-swift-demo", isDirectory: true)

let search = try SearchFn(
    sqlite: SearchFnSQLiteAdapterConfiguration(
        rootURL: rootURL,
        indexKey: "project-docs"
    )
)

let client = search.client()

try await client.initialize(
    SearchFnInitializeParams(
        resources: [
            SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title", "body"])
        ]
    )
)

try await client.index(
    SearchFnIndexParams(
        resource: "docs",
        documents: [
            SearchFnDocument(id: "d1", fields: ["title": "Getting started", "body": "Swift search runtime"])
        ]
    )
)

let ids = try await client.search(
    SearchFnSearchParams(resource: "docs", query: "getting")
)

try await client.dispose()
```

## Ranking

The built-in Swift engine scores original tokens with BM25-style term-frequency saturation and document-length normalization. Generated edge n-grams remain available through `analyze`, but do not add duplicate ranking evidence or inflate document lengths: prefix searches expand against the original-token vocabulary. An exact-only query does not silently match an indexed prefix.

Field boosts multiply the complete BM25 contribution, after saturation (including the additive `d` term). Prefix expansions use a `0.7` multiplier and fuzzy-only expansions use `0.5`; if both expansions select the same term, only the stronger contribution is retained. This keeps comparable exact matches above prefix matches, and prefix matches above fuzzy-only matches, without counting an indexed prefix and its full word twice. Frequency, length, rarity, and explicit field boosts still affect relevance; the match types are penalties, not absolute ranking tiers.

The memory and SQLite adapters compute BM25 statistics independently per resource. Native `searchAll` divides each resource's scores by its best match's score before merging, then sorts by `score DESC, resource ASC, id ASC` and applies the overall limit. Equally strong top matches therefore tie at `1.0` even when resource sizes differ. Relative ordering within each resource is preserved; normalized scores are not probabilities or globally calibrated relevance. In particular, a resource containing only fuzzy matches can tie another resource's best exact match. Use `limitPerResource` for diversity or rerank when absolute cross-resource relevance is needed.

These are the Swift built-in adapters' ranking rules; raw scores should not be compared with TypeScript or external-backend scores. The low-level public `searchFnScorePostings` helper still accepts caller-supplied posting chunks and IDF values without resource normalization.

## Persistence Ownership

The SQLite adapter stores SearchFn-owned derived search state under a caller-supplied root directory:

```text
<rootURL>/<slug(indexKey)>-<hash16(indexKey)>/
  searchfn.sqlite
  manifest.json
```

- `searchfn.sqlite` contains SearchFn-owned resource configs, documents, postings, vocabulary counts, and metadata.
- `manifest.json` records the persisted SearchFn format and schema version.
- The persisted index is owned by SearchFn, not by Core Data.
- Reopening the same `rootURL + indexKey` recreates equivalent search behavior from the persisted store.

## Diagnostics

Diagnostics are opt-in. Pass a `SearchFnDiagnosticsSink` through `SearchFnClientConfiguration`, `SearchFnMemoryAdapter`, or `SearchFnSQLiteAdapterConfiguration`.

Diagnostics include counts, resource names, query length, and persistence lifecycle metadata. They intentionally do not include raw indexed field values or the full query string.

## Examples

Compile-checkable example entrypoints live under:

- `searchfn/swift/Examples/InMemoryExample/main.swift`
- `searchfn/swift/Examples/SQLiteExample/main.swift`

They demonstrate `initialize`, `index`, `search`, `searchAll`, `remove`, `clear`, and `dispose`.
