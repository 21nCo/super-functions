# @apifn/collections

OpenCollection YAML read/write/run for ApiFn. Read and write portable API request collections, generate them from OpenAPI specs or routers, and run them as a test suite with assertions, scripting, and pluggable reporters.

## Installation

```bash
npm install @apifn/collections
```

## Features

- **Read / Write** — Load and persist an OpenCollection directory (`opencollection.yml` + per-request YAML + environments)
- **Generate** — Produce a collection from an OpenAPI document or a `@superfunctions/http` router
- **Run** — Execute a collection with sequential or parallel scheduling, retries, timeouts, and bail-on-failure
- **Assertions** — Chai-like `expect`/`test` runtime with JSON Schema and JSONPath support
- **Scripting** — Sandboxed pre-request and test scripts (Node `vm`, no `process`/`require`/`fetch`)
- **Reporters** — Console, JSON, JUnit XML, and silent reporters
- **Safety** — Secret redaction in captured request/response data, path-traversal-safe writes

---

## Reading & Writing

### readCollection

Reads an OpenCollection directory. Expects `opencollection.yml` at the root; files under `environments/` become environments; any YAML with both `info` and `http` keys is a request. Items are assembled into a nested folder tree.

```typescript
import { readCollection } from "@apifn/collections";

const collection = await readCollection("./.apifn/collection");
// { info, environments, items, rootDir }
```

### writeCollection

Persists a `Collection` back to its `rootDir` (writes `opencollection.yml`, `environments/*.yml`, and each request/folder). Paths are validated against traversal.

```typescript
import { writeCollection } from "@apifn/collections";

await writeCollection(collection);
```

### validateCollection

Returns `ValidationError[]` describing structural problems (missing `info.name`, malformed environments, requests missing `http.method`, etc.).

```typescript
import { validateCollection } from "@apifn/collections";

const errors = validateCollection(collection);
```

---

## Generating Collections

### openAPIToCollection

Build a collection from an OpenAPI document. Operations are grouped by tag (default) or first path segment.

```typescript
import { openAPIToCollection } from "@apifn/collections";

const collection = openAPIToCollection(openApiDoc, {
  baseUrl: "https://api.example.com",
  environmentName: "development",
  groupBy: "tag", // or "path"
  includeExamples: true,
});
```

### routerToCollection

Introspect a `@superfunctions/http` router and produce a collection in one step.

```typescript
import { routerToCollection } from "@apifn/collections";

const collection = routerToCollection(router, {
  baseUrl: "https://api.example.com",
  info: { title: "My API", version: "1.0.0" },
});
```

Path params `{id}` become `{{id}}` template variables and URLs are prefixed with `{{baseUrl}}`.

---

## Running Collections

### runCollection

Execute a collection against an environment. Returns a `RunReport`.

```typescript
import { readCollection, runCollection, createConsoleReporter } from "@apifn/collections";

const collection = await readCollection("./.apifn/collection");
const report = await runCollection(collection, {
  environment: "development",
  reporter: createConsoleReporter(),
  parallel: false,
  bail: false,
  retries: 1,
  timeout: 30_000,
});

console.log(report.summary);
// { total, passed, failed, skipped, errors, duration }
```

#### RunOptions

| Option | Type | Description |
|--------|------|-------------|
| `environment` | `string \| Environment` | Environment name or object (required) |
| `include` / `exclude` | `string[]` | Glob-ish patterns matched against path/name/`"METHOD url"` |
| `parallel` | `boolean` | Run requests concurrently (default: sequential) |
| `concurrency` | `number` | Max concurrent requests in parallel mode (default: 4) |
| `timeout` | `number` | Per-request timeout in ms (default: 30000) |
| `bail` | `boolean` | Stop on first failure |
| `retries` | `number` | Retry network errors and HTTP 5xx responses (default: 0) |
| `delay` | `number` | Delay between sequential requests in ms |
| `httpClient` | `HttpClient` | Custom client (default: built-in fetch-based) |
| `cookieJar` | `CookieJar` | Shared cookie jar |
| `reporter` | `RunReporter` | Progress/result reporter |
| `overrides` | `Record<string, string>` | Variable overrides (highest precedence) |
| `redactHeaders` | `string[]` | Extra headers to redact in captured data |

A request passes when its status matches the expected status (default `< 400`, or `settings.expectedStatus`) and no assertion fails.

**Redaction:** `authorization`, `cookie`, `set-cookie`, `x-api-key`, and `x-auth-token` headers are redacted by default (plus any `redactHeaders`), and common secret-bearing body keys (`token`, `password`, `apiKey`, `otp`, …) are recursively masked.

---

## Reporters

| Reporter | Factory | Output |
|----------|---------|--------|
| Console | `createConsoleReporter({ color?, write? })` | Colored per-request badges + summary |
| JSON | `createJsonReporter({ write?, indent? })` | Full `RunReport` as JSON |
| JUnit | `createJUnitReporter({ write? })` | JUnit XML (`reportToJUnitXml(report)` for a string) |
| Silent | `createSilentReporter()` | No output |

```typescript
import { runCollection, createJsonReporter } from "@apifn/collections";

await runCollection(collection, {
  environment: "development",
  reporter: createJsonReporter({ indent: 2 }),
});
```

---

## Assertions

`createAssertionRuntime()` returns a Chai-like `expect`/`test` API used inside test scripts.

```typescript
import { createAssertionRuntime } from "@apifn/collections";

const { expect, test, getResults } = createAssertionRuntime();
const response = {
  status: 200,
  body: { id: "usr_123", roles: ["admin"], profile: { email: "dev@example.com" } },
  responseTime: 120,
};

test("returns the user", () => {
  expect(response.status).to.equal(200);
  expect(response.body).to.have.property("id");
  expect(response.body.roles).to.include("admin");
  expect(response.body).to.have.jsonPath("$.profile.email");
  expect(response.responseTime).to.be.below(500);
});

const results = getResults(); // AssertionResult[]
```

Supported matchers: `.equal`, `.include`, `.matchSchema`, `.have.property`, `.have.length` / `.have.length.above`, `.have.jsonPath`, `.be.below`.

---

## Scripting

Pre-request and test scripts run in a locked-down Node `vm` sandbox (`SCRIPT_TIMEOUT_MS` = `10000` ms). Available globals: `console`, `URL`, `URLSearchParams`, `crypto.randomUUID`, `btoa`, `atob`. Disabled: `process`, `require`, `module`, `fetch`, `eval`, `Function`, timers.

```typescript
import { executePreRequestScript, executeTestScript } from "@apifn/collections";
```

- `executePreRequestScript({ code, env, req, cookies?, timeoutMs? })` — mutate `req`, set `env` variables before sending
- `executeTestScript({ code, env, req, res, cookies?, assertionResults, timeoutMs? })` — assert against `res` with `expect`/`test`

---

## Environments & Variables

```typescript
import {
  readEnvironments,
  selectEnvironment,
  interpolateVariables,
  resolveVariableContext,
  loadDotEnvFile,
} from "@apifn/collections";

const envs = await readEnvironments("./.apifn/collection/environments");
const env = selectEnvironment(envs, "development");

const context = resolveVariableContext({
  collection: {},
  environment: env.variables, // collection < environment < overrides
  overrides: loadDotEnvFile(".env"),
});

const { value, warnings } = interpolateVariables(
  "{{baseUrl}}/users?token={{process.env.API_TOKEN}}",
  context,
  { processEnv: process.env },
);
```

`{{var}}` tokens are replaced from the context; unknown context tokens are left intact and reported in `warnings`. `{{process.env.X}}` reads from the `processEnv` interpolation option (or the current process by default) and throws if the requested environment variable is not set.

---

## HTTP Client & Cookies

```typescript
import { createFetchHttpClient, createCookieJar } from "@apifn/collections";

const jar = createCookieJar();
const client = createFetchHttpClient({ cookieJar: jar, followRedirects: true, maxRedirects: 10 });
```

The built-in fetch client handles redirects manually, strips sensitive headers on cross-origin redirects, downgrades 303 to GET, and injects/stores cookies via the jar.

## License

MIT
