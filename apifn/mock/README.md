# @apifn/mock

Mock server for ApiFn. Spin up a zero-dependency HTTP server from any OpenAPI document that returns realistic responses, optionally validating incoming requests against the spec.

## Installation

```bash
npm install @apifn/mock
```

## Features

- **Instant mock server** — Serve every operation in an OpenAPI spec with no framework
- **Three response modes** — Deterministic from schema, from examples, or randomized
- **Request validation** — Optionally validate query/path params and JSON bodies against schemas
- **Latency simulation** — Add a fixed response delay
- **CORS** — Built-in CORS handling with sensible defaults or custom options
- **Safety** — Configurable max request body size (default 10 MiB)

---

## createMockServer

```typescript
import { createMockServer } from "@apifn/mock";
import { parseOpenAPI } from "@apifn/core";
import { readFile } from "node:fs/promises";

const spec = parseOpenAPI(await readFile("./openapi.yml", "utf8"));

const mock = createMockServer({
  spec,
  port: 4010,
  responseMode: "schema", // "schema" | "examples" | "random"
  validateRequests: true,
  delay: 0,
  cors: true,
});

await mock.start();
console.log(`Mock server listening on http://localhost:${mock.port}`);

// later
await mock.stop();
```

### MockServerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `OpenAPIDocument` | — | The OpenAPI document to mock (required) |
| `port` | `number` | `4010` | Port to bind (use `0` for a random free port) |
| `responseMode` | `"schema" \| "examples" \| "random"` | `"schema"` | How response bodies are generated |
| `validateRequests` | `boolean` | `false` | Validate incoming params and JSON bodies |
| `delay` | `number` | `0` | Response delay in ms (simulate latency) |
| `maxRequestBodyBytes` | `number` | `10 MiB` | Max accepted request body size |
| `cors` | `boolean \| CorsOptions` | — | Enable/configure CORS |

### MockServer

```typescript
interface MockServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  server: http.Server; // underlying Node server
  port: number;        // the actually-bound port
}
```

Unmatched routes return `404 { error: "Not Found", path }`. `OPTIONS` preflight requests return `204`.

---

## Response Generation

Use the generators directly when you need a mock payload without a server.

### generateResponse

Pick the first 2xx response for an operation and produce a body for the given mode.

```typescript
import { generateResponse } from "@apifn/mock";

const { statusCode, body } = generateResponse(operation, "schema");
```

### generateFromSchema

Deterministic values from a JSON schema — strings become `"string"` (format-aware for `date-time`, `email`, `uri`, `uuid`, …), numbers `0`, booleans `true`, arrays a single generated item, objects recurse over their properties.

```typescript
import { generateFromSchema } from "@apifn/mock";

generateFromSchema({ type: "object", properties: { id: { type: "string", format: "uuid" } } });
// { id: "00000000-0000-0000-0000-000000000000" }
```

### generateRandom

Like `generateFromSchema` but produces randomized values valid against the schema.

```typescript
import { generateRandom } from "@apifn/mock";

const value = generateRandom(schema);
```

---

## Request Validation

Self-contained JSON-schema validation (no external dependencies).

### validateRequestBody

```typescript
import { validateRequestBody } from "@apifn/mock";

const result = validateRequestBody(body, operation);
// { valid: boolean, errors: ValidationError[] }  where ValidationError = { path, message }
```

Reads `operation.requestBody.content["application/json"].schema`; if the body is required but missing, returns an error.

### validateParameters

```typescript
import { validateParameters } from "@apifn/mock";

const result = validateParameters(queryParams, pathParams, operation);
```

Checks `operation.parameters` for missing required query/path params and basic numeric coercion.

---

## Exports

```typescript
export { createMockServer }
export type { MockServer }
export { generateFromSchema, generateRandom, generateResponse }
export type { ResponseMode }
export { validateRequestBody, validateParameters }
export type { ValidationError, ValidationResult }
```

## License

MIT
