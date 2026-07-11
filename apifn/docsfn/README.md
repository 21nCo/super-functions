# @apifn/docsfn

docsfn plugin for ApiFn API reference. Turn an OpenAPI document into docsfn content entries and render them as an interactive API reference (React or Svelte) with embedded Try-It consoles and performance metrics.

## Installation

```bash
npm install @apifn/docsfn
```

`docsfn` is an **optional** peer dependency — this package defines the minimal `DocsContentProvider` / `RawContentEntry` interfaces itself, so you get correct types even without docsfn installed.

## Features

- **Content provider** — Convert an OpenAPI spec into docsfn `RawContentEntry[]`
- **Tag splitting** — One page per tag (default) or a single full-spec page
- **Sidebar generation** — Auto-built navigation with per-endpoint anchors
- **Reference renderers** — `ApifnApiReference` for React and Svelte, wrapping the `@apifn/react` / `@apifn/svelte` components

---

## createApifnProvider

Create a `DocsContentProvider` — a callable that returns `RawContentEntry[]` (memoized) and carries an `.entries` array.

```typescript
import { createApifnProvider } from "@apifn/docsfn";

const provider = createApifnProvider({
  specPath: "./openapi.yml", // or: spec: openApiDocument
  basePath: "/api",
  splitByTag: true,
});

const entries = await provider(); // RawContentEntry[]
```

### CreateApifnProviderOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `OpenAPIDocument` | — | The document (provide this or `specPath`) |
| `specPath` | `string` | — | Path to a JSON or YAML spec |
| `basePath` | `string` | `"/api"` | Slug prefix for generated pages |
| `splitByTag` | `boolean` | `true` | One entry per tag, or a single full-spec entry |
| `baseUrl` | `string` | — | Base URL embedded in entries (for Try-It) |

With `splitByTag: true`, each tag becomes a `RawContentEntry` with slug `${basePath}/${tag}` and a sidebar group whose links point to per-endpoint anchors (`${slug}#${method}-${path}`). With `splitByTag: false`, a single entry contains every endpoint. Path-level parameters are merged into each operation.

---

## Rendering the reference

The package root (`@apifn/docsfn`) exports the provider and types. `ApifnApiReference` renderer components are provided for both React (`src/react/ApifnApiReference.tsx`) and Svelte (`src/svelte/ApifnApiReference.svelte`) and are imported from their component source; docsfn wires them up to render each `RawContentEntry`.

```tsx
import { ApifnApiReference } from "@apifn/docsfn/src/react/ApifnApiReference";

<ApifnApiReference
  entry={entry}
  tryIt
  baseUrl="https://api.example.com"
  theme="light"
  performanceMetrics={{
    "GET /users": { p50Ms: 12, p95Ms: 40, p99Ms: 90, errorRatePct: 0.5, requestsPerMinute: 320 },
  }}
/>
```

The Svelte renderer takes the same props (`entry`, `tryIt`, `baseUrl`, `theme`, `performanceMetrics`).

### ApifnApiReferenceProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `entry` | `RawContentEntry` | — | A single entry from `createApifnProvider` (required) |
| `tryIt` | `boolean` | `false` | Show an embedded Try-It console per endpoint |
| `baseUrl` | `string` | `entry.spec.servers[0].url` | Base URL for Try-It requests |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | Theme for embedded components |
| `performanceMetrics` | `Record<string, …>` | — | Per-endpoint metrics keyed `"METHOD /path"` (you supply `p50Ms`/`p95Ms`/`p99Ms`/`errorRatePct`/`requestsPerMinute`) |

Each endpoint renders as a collapsible card with Docs / Try It / Performance tabs, delegating to the `EndpointViewer`, `TryIt`, and `PerformanceOverlay` components from `@apifn/react` / `@apifn/svelte`.

---

## How it plugs into docsfn

`createApifnProvider(...)` yields a `DocsContentProvider` that docsfn's content pipeline consumes. Each `RawContentEntry` carries `kind: "api"` (signalling an API reference page), a `sidebar` group for navigation, and the full `spec`. docsfn renders each entry with the matching `ApifnApiReference` component.

## Exports

```typescript
export { createApifnProvider }
export type {
  DocsContentProvider, RawContentEntry, ApiEndpoint,
  SidebarItem, SidebarLink, SidebarGroup,
  CreateApifnProviderOptions, ApifnApiReferenceProps,
  OpenAPIDocument, OperationObject,
}
// ApifnApiReference components live in src/react and src/svelte (imported from source)
```

## License

MIT
