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

With `splitByTag: true`, each tag becomes a `RawContentEntry`. The tag is lowercased and each run of non-alphanumeric characters becomes `-`, so `My Tag Group` produces `${basePath}/my-tag-group`. Sidebar links use the lowercased method followed by the path with each non-alphanumeric character replaced by `-`; for example, `GET /users/{id}` links to `${slug}#get--users--id-`. With `splitByTag: false`, a single entry contains every endpoint. Path-level parameters are merged into each operation.

---

## Rendering the reference

The package root (`@apifn/docsfn`) exports the provider and types. Renderer components are available from framework-specific public subpaths:

- React: `@apifn/docsfn/react`
- Svelte: `@apifn/docsfn/svelte`

Pass each `RawContentEntry` returned by the provider to the renderer used by your docsfn integration.

```tsx
import { ApifnApiReference } from "@apifn/docsfn/react";

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

The Svelte renderer takes the same props (`entry`, `tryIt`, `baseUrl`, `theme`, `performanceMetrics`):

```svelte
<script lang="ts">
  import ApifnApiReference from "@apifn/docsfn/svelte";
</script>

<ApifnApiReference {entry} tryIt theme="auto" />
```

### ApifnApiReferenceProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `entry` | `RawContentEntry` | — | A single entry from `createApifnProvider` (required) |
| `tryIt` | `boolean` | `false` | Show an embedded Try-It console per endpoint |
| `baseUrl` | `string` | See below | Base URL for Try-It requests |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | Theme for embedded components |
| `performanceMetrics` | `Record<string, …>` | — | Per-endpoint metrics keyed `"METHOD /path"` (you supply `p50Ms`/`p95Ms`/`p99Ms`/`errorRatePct`/`requestsPerMinute`) |

Each endpoint renders as a collapsible card with Docs / Try It / Performance tabs, delegating to the `EndpointViewer`, `TryIt`, and `PerformanceOverlay` components from `@apifn/react` / `@apifn/svelte`.

The Try-It base URL is selected in this order: the renderer's `baseUrl` prop, the provider's `baseUrl` embedded in the entry, the first URL in `entry.spec.servers`, then `https://api.example.com` as a placeholder fallback.

---

## How it plugs into docsfn

`createApifnProvider(...)` yields a `DocsContentProvider` suitable for a docsfn content pipeline. Each `RawContentEntry` carries `kind: "api"`, a `sidebar` group for navigation, and the full `spec`. Register the provider and the appropriate `ApifnApiReference` renderer in your docsfn application according to its integration API.

## Exports

```typescript
export { createApifnProvider }
export type {
  DocsContentProvider, RawContentEntry, ApiEndpoint,
  SidebarItem, SidebarLink, SidebarGroup,
  CreateApifnProviderOptions, ApifnApiReferenceProps,
  OpenAPIDocument, OperationObject,
}
// React: import { ApifnApiReference } from "@apifn/docsfn/react"
// Svelte: import ApifnApiReference from "@apifn/docsfn/svelte"
```

## License

MIT
