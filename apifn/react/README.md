# @apifn/react

React UI components for ApiFn. Render an interactive API explorer — endpoint docs, a live Try-It console, schema viewer, request history, response diffing, and performance overlays — from any OpenAPI document.

## Installation

```bash
npm install @apifn/react
```

`react` and `react-dom` (`^18` or `^19`) are peer dependencies.

## Components

| Component | Purpose |
|-----------|---------|
| `ApiExplorer` | Full explorer shell (sidebar + tabs) — the all-in-one entry point |
| `EndpointViewer` | Documentation for a single operation (params, body, responses) |
| `SchemaViewer` | Collapsible JSON-schema tree |
| `TryIt` | Live request console with auth, params, and body |
| `RequestHistory` | List of past requests with expandable detail |
| `ResponseDiff` | Side-by-side diff of two responses |
| `PerformanceOverlay` | Latency/throughput KPIs and bar charts |

---

## Quick Start

```tsx
import { ApiExplorer } from "@apifn/react";

export function Docs({ spec }) {
  return <ApiExplorer spec={spec} baseUrl="https://api.example.com" theme="dark" showHistory />;
}
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
| `className` | `string` | — | Custom class name |

The explorer renders a searchable, tag-grouped sidebar and tabs for Documentation, Try It, Performance (when `watchfn` is supplied), and History (when `showHistory`). It collapses to a hamburger menu at ≤768px.

---

## Individual Components

```tsx
import {
  EndpointViewer,
  SchemaViewer,
  TryIt,
  RequestHistory,
  ResponseDiff,
  PerformanceOverlay,
} from "@apifn/react";

// Docs for one operation
<EndpointViewer path="/users/{id}" method="get" operation={op} />

// Schema tree
<SchemaViewer schema={userSchema} name="User" required expandDepth={3} />

// Live request console
<TryIt
  path="/users"
  method="post"
  operation={op}
  baseUrl="https://api.example.com"
  defaultAuth={{ type: "bearer", token: "abc" }}
  onResponse={(r) => console.log(r.statusCode)}
/>

// History (typically driven by TryIt via onResponse)
<RequestHistory entries={entries} onClear={() => setEntries([])} onSelect={setSelected} maxEntries={500} />

// Compare two responses
<ResponseDiff left={respA} right={respB} leftLabel="v1" rightLabel="v2" />

// Performance KPIs
<PerformanceOverlay
  metrics={{
    endpoint: "/users", method: "get",
    p50Ms: 12, p95Ms: 40, p99Ms: 90,
    errorRatePct: 0.5, requestsPerMinute: 320,
    lastUpdated: new Date().toISOString(),
  }}
  compact
/>
```

### Component props at a glance

- **EndpointViewer** — `path`, `method`, `operation` (all required)
- **SchemaViewer** — `schema` (required), `name?`, `required?` (default `false`), `expandDepth?` (default `2`)
- **TryIt** — `path`, `method`, `operation` (required), `baseUrl?`, `defaultAuth?: AuthConfig`, `onResponse?: (r: TryItResponse) => void`
- **RequestHistory** — `entries: HistoryEntry[]` (required), `onClear?`, `onSelect?`, `maxEntries?` (default `500`)
- **ResponseDiff** — `left`, `right` (required), `leftLabel?` (`"Before"`), `rightLabel?` (`"After"`)
- **PerformanceOverlay** — `metrics: PerformanceMetrics` (required), `compact?` (default `false`)

---

## Theming

All components are styled with `--apifn-*` CSS variables and ship a `.apifn-root` scope. `ApiExplorer` (and docsfn's `ApifnApiReference`) inject the theme automatically; when using leaf components standalone, render them inside a themed `ApiExplorer` or provide the CSS variables yourself. `theme="auto"` follows `prefers-color-scheme`.

---

## Exports

```typescript
export { ApiExplorer, EndpointViewer, SchemaViewer, TryIt, RequestHistory, ResponseDiff, PerformanceOverlay }
export type {
  ApiExplorerProps, EndpointViewerProps, SchemaViewerProps, TryItProps,
  RequestHistoryProps, ResponseDiffProps, PerformanceOverlayProps,
}
export type { Theme, HistoryEntry, PerformanceMetrics, AuthConfig, TryItResponse }
```

## License

MIT
