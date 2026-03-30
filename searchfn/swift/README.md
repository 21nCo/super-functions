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
