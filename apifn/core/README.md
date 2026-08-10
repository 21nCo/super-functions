# @apifn/core

Core JavaScript/TypeScript library for ApiFn — route introspection, schema conversion, OpenAPI generation, and diff. The other ApiFn npm packages build on `@apifn/core`.

## Installation

```bash
npm install @apifn/core
```

## Features

- **Route Introspection** — Walk a `@superfunctions/http` router and describe every route (parameters, request bodies, responses, security)
- **Schema Conversion** — Convert Zod and TypeBox schemas to JSON Schema, with auto-detection and deduplication
- **OpenAPI Generation** — Produce an OpenAPI 3.1 document directly from a router
- **OpenAPI Parsing & Validation** — Parse YAML/JSON specs and validate them against the OpenAPI schema
- **Diff** — Compare two OpenAPI documents and classify changes as breaking / non-breaking
- **Integrations** — First-class hooks for authfn, secfn, watchfn, logfn, and testfn

---

## OpenAPI Generation

### fromRouter

Generate an OpenAPI document from a `@superfunctions/http` router in one step. `FromRouterOptions` combines `OpenAPIGenerateOptions` (info, servers, security schemes) and `IntrospectOptions` (include/exclude/basePath).

```typescript
import { fromRouter } from "@apifn/core";

const doc = fromRouter(router, {
  info: {
    title: "My API",
    version: "1.0.0",
    description: "Public API surface",
  },
  servers: [{ url: "https://api.example.com" }],
  // IntrospectOptions
  include: ["/v1"],
  exclude: ["/internal"],
  basePath: "/api",
});
```

### introspectRouter

Describe a router's routes without generating a full document. Returns `IntrospectedRoute[]`.

```typescript
import { introspectRouter } from "@apifn/core";

const routes = introspectRouter(router, { include: ["/v1"] });
// [{ method, path, parameters, requestBody, responses, security }, ...]
```

### generateOpenAPI

Build the document from already-introspected routes. `fromRouter` is `introspectRouter` + `generateOpenAPI`.

```typescript
import { introspectRouter, generateOpenAPI } from "@apifn/core";

const doc = generateOpenAPI(introspectRouter(router), {
  info: { title: "My API", version: "1.0.0" },
});
```

---

## Parsing & Validation

### parseOpenAPI

Parse a YAML or JSON OpenAPI string into an `OpenAPIDocument`.

```typescript
import { parseOpenAPI } from "@apifn/core";
import { readFile } from "node:fs/promises";

const doc = parseOpenAPI(await readFile("./openapi.yml", "utf8"));
```

### validateOpenAPI

Validate a document. Returns validation errors (`ValidationError[]`) for a report or gate.

```typescript
import { validateOpenAPI } from "@apifn/core";

const errors = await validateOpenAPI(doc);
if (errors.length > 0) {
  // handle invalid spec
}
```

### upconvertFrom3_0

Up-convert an OpenAPI 3.0 document to 3.1.

```typescript
import { upconvertFrom3_0 } from "@apifn/core";

const doc31 = upconvertFrom3_0(doc30);
```

---

## Schema Conversion

ApiFn converts framework-native schemas to JSON Schema for OpenAPI output.

| Function | Description |
|----------|-------------|
| `detectSchemaType(schema)` | Detect whether a value is a Zod, TypeBox, or plain JSON schema (`SchemaType`) |
| `convertSchema(schema)` | Convert any supported schema to JSON Schema, auto-detecting the type |
| `convertZodSchema(schema)` | Convert a Zod schema to JSON Schema |
| `convertTypeBoxSchema(schema)` | Convert a TypeBox schema to JSON Schema |
| `deduplicateSchemas(input)` | Extract shared/duplicated schemas into reusable `components` (`DeduplicateSchemasResult`) |

```typescript
import { convertSchema, detectSchemaType } from "@apifn/core";
import { z } from "zod";

detectSchemaType(z.object({ id: z.string() })); // "zod"
const jsonSchema = convertSchema(z.object({ id: z.string() }));
```

### apiSchema

Attach a schema descriptor to a route so introspection can pick up request/response shapes.

```typescript
import { apiSchema } from "@apifn/core";
```

---

## Diff

### diffOpenAPI

Compare two OpenAPI documents. Returns a `DiffResult` with a list of `DiffEntry` changes, each classified by severity.

```typescript
import { diffOpenAPI, formatDiffAsText, formatDiffAsJson } from "@apifn/core";

const result = diffOpenAPI(beforeDoc, afterDoc);

console.log(formatDiffAsText(result)); // human-readable
const report = formatDiffAsJson(result); // DiffReportJson (machine-readable)
```

- `formatDiffAsText(result)` — colored/plain text summary
- `formatDiffAsJson(result)` — structured `DiffReportJson` for CI artifacts

---

## Integrations

### watchfn

Fetch endpoint performance metrics and stream request telemetry to a watchfn instance.

```typescript
import {
  fetchEndpointMetrics,
  createWatchFnClient,
  apifnWatchMiddleware,
} from "@apifn/core";

// Fetch p50/p95/p99 + error-rate metrics; degrades gracefully to [] on failure
const metrics = await fetchEndpointMetrics({
  baseUrl: "https://watch.example.com",
  timeRange: "PT1H", // ISO 8601 duration
});

const client = createWatchFnClient({ baseUrl: "https://watch.example.com" });

// Middleware records per-endpoint timing to watchfn
router.use(apifnWatchMiddleware({ baseUrl: "https://watch.example.com" }));
```

### authfn

Mint short-lived test tokens (TTL ≤ 3600s) and inject bearer auth into collection runs.

```typescript
import { mintTestToken, createAuthfnCollectionMiddleware } from "@apifn/core";

const { token, expiresAt } = await mintTestToken(
  { baseUrl: "https://auth.example.com", adminKey: process.env.AUTHFN_ADMIN_KEY },
  { ttl: 900, scopes: ["read"] },
);

const client = createAuthfnCollectionMiddleware(baseHttpClient, token);
```

### secfn

Fetch (non-consuming) rate-limit information for endpoints.

```typescript
import { fetchRateLimits } from "@apifn/core";

const limits = await fetchRateLimits(rateLimiter, ["GET /users"]); // RateLimitInfo[]
```

### logfn

Structured reporter and CLI logger.

```typescript
import { logfnReporter, createCliLogger } from "@apifn/core";

const logger = createCliLogger({ /* CliLoggerOptions */ });
```

### testfn

Adapter that plugs ApiFn collection runs into testfn.

```typescript
import { ApifnTestAdapter } from "@apifn/core";
```

---

## Exports

```typescript
// OpenAPI
export { fromRouter, introspectRouter, generateOpenAPI, parseOpenAPI, validateOpenAPI, upconvertFrom3_0 }

// Schema
export { detectSchemaType, convertSchema, convertZodSchema, convertTypeBoxSchema, deduplicateSchemas, apiSchema }

// Diff
export { diffOpenAPI, formatDiffAsText, formatDiffAsJson }

// Integrations
export { fetchEndpointMetrics, createWatchFnClient, apifnWatchMiddleware }
export { mintTestToken, createAuthfnCollectionMiddleware }
export { fetchRateLimits }
export { logfnReporter, createCliLogger }
export { ApifnTestAdapter }

// Types — HTTP, OpenAPI document objects, introspection descriptors,
// diff, validation, snippets, mock, and integration types
```

The `@apifn/core/types` subpath re-exports the full type surface for consumers who only need types.

## License

MIT
