# @apifn/svelte

Svelte UI components for ApiFn. The Svelte counterpart to [`@apifn/react`](../react) — an interactive API explorer, live Try-It console, schema viewer, request history, response diffing, and performance overlays, rendered from any OpenAPI document.

## Installation

```bash
npm install @apifn/svelte
```

`svelte` (`^4` or `^5`) is a peer dependency.

> Components are shipped as **`.svelte` source** and compiled by your app's Svelte toolchain. Import each component from its own subpath (e.g. `@apifn/svelte/ApiExplorer.svelte`). The package root (`@apifn/svelte`) exports TypeScript prop types only.

## Components

| Component | Subpath | Purpose |
|-----------|---------|---------|
| `ApiExplorer` | `@apifn/svelte/ApiExplorer.svelte` | Full explorer shell — the all-in-one entry point |
| `EndpointViewer` | `@apifn/svelte/EndpointViewer.svelte` | Documentation for a single operation |
| `SchemaViewer` | `@apifn/svelte/SchemaViewer.svelte` | Collapsible JSON-schema tree |
| `TryIt` | `@apifn/svelte/TryIt.svelte` | Live request console |
| `RequestHistory` | `@apifn/svelte/RequestHistory.svelte` | Past requests with expandable detail |
| `ResponseDiff` | `@apifn/svelte/ResponseDiff.svelte` | Side-by-side response diff |
| `PerformanceOverlay` | `@apifn/svelte/PerformanceOverlay.svelte` | Latency/throughput KPIs |

---

## Quick Start

```svelte
<script>
  import ApiExplorer from "@apifn/svelte/ApiExplorer.svelte";
  export let spec;
</script>

<ApiExplorer {spec} baseUrl="https://api.example.com" theme="auto" showHistory={true} />
```

### ApiExplorer props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `spec` | `OpenAPIDocument` | — | The document to render (required) |
| `baseUrl` | `string` | `spec.servers[0].url` | Base URL for Try-It requests |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | Color theme |
| `showHistory` | `boolean` | `true` | Show the request history tab |
| `watchfn` | `WatchFnClient` | — | Enables the Performance tab (polled metrics) |
| `watchfnInterval` | `number` | `10000` | Metrics polling interval in ms |
| `rateLimits` | `Record<string, RateLimitInfo>` | — | Rate-limit badges, keyed `"METHOD /path"` |

The explorer renders a searchable, tag-grouped sidebar and Documentation / Try It / Performance / History tabs, collapsing to a hamburger overlay at ≤768px.

---

## Individual Components

```svelte
<script>
  import EndpointViewer from "@apifn/svelte/EndpointViewer.svelte";
  import TryIt from "@apifn/svelte/TryIt.svelte";
  import SchemaViewer from "@apifn/svelte/SchemaViewer.svelte";
  export let operation;
  export let schema;
</script>

<EndpointViewer path="/users/{id}" method="get" {operation} />

<SchemaViewer {schema} name="User" required expandDepth={3} />

<TryIt
  path="/users"
  method="post"
  {operation}
  baseUrl="https://api.example.com"
  on:response={(e) => console.log(e.detail.statusCode)}
/>
```

### Events

Unlike the React package's callback props, Svelte components dispatch events:

- **TryIt** — `on:response` with a `TryItResponse` detail
- **RequestHistory** — `on:select` (a `HistoryEntry`) and `on:clear`

### Component props at a glance

- **EndpointViewer** — `path`, `method`, `operation` (required)
- **SchemaViewer** — `schema` (required), `name?`, `required?` (default `false`), `expandDepth?` (default `2`)
- **TryIt** — `path`, `method`, `operation` (required), `baseUrl?`
- **RequestHistory** — `entries: HistoryEntry[]`, `maxEntries?` (default `500`)
- **ResponseDiff** — `left`, `right` (required), `leftLabel?` (`"Before"`), `rightLabel?` (`"After"`)
- **PerformanceOverlay** — `metrics: PerformanceMetrics` (required), `compact?` (default `false`)

---

## Theming

Components use `--apifn-*` CSS variables scoped to `.apifn-root`. `ApiExplorer` injects the theme automatically; the leaf components expect those variables to be provided by a parent (an `ApiExplorer` or docsfn's `ApifnApiReference`). `theme="auto"` follows `prefers-color-scheme`.

## Types

The package root exports prop interfaces for TypeScript consumers: `ApiExplorerProps`, `EndpointViewerProps`, `SchemaViewerProps`, `TryItProps`, `RequestHistoryProps`, `ResponseDiffProps`, `PerformanceOverlayProps`, plus `HistoryEntry`, `TryItResponse`, and `PerformanceMetrics`. `OpenAPIDocument`, `OperationObject`, and `SchemaObject` are re-exported from `@apifn/core`.

## License

MIT
