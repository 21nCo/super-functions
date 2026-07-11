# @apifn/snippets

Code snippet generation for ApiFn. Turn any OpenAPI operation into a ready-to-run request snippet across 11 languages and HTTP clients.

## Installation

```bash
npm install @apifn/snippets
```

## Supported Targets

| Target | Language / Client |
|--------|-------------------|
| `curl` | cURL |
| `fetch` | Browser Fetch |
| `axios` | Axios (Node/browser) |
| `node-fetch` | node-fetch |
| `python-requests` | Python `requests` |
| `python-httpx` | Python `httpx` |
| `go-http` | Go `net/http` |
| `ruby-net-http` | Ruby `Net::HTTP` |
| `php-curl` | PHP cURL |
| `csharp-httpclient` | C# `HttpClient` |
| `java-okhttp` | Java OkHttp |

`SUPPORTED_TARGETS` exports this list at runtime.

---

## generateSnippet

Generate a snippet for a single operation.

```typescript
import { generateSnippet } from "@apifn/snippets";

const code = generateSnippet(operation, "/users/{id}", "get", {
  target: "curl",
  baseUrl: "https://api.example.com",
  auth: { type: "bearer", token: "abc123" },
  indent: 2,
});

console.log(code);
```

### SnippetOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `SnippetTarget` | — | Language/client (required) |
| `baseUrl` | `string` | — | Base URL (required) |
| `auth` | `{ type: string; token?; key? }` | — | Inject auth headers (`bearer` / `apikey` / `basic`) |
| `indent` | `number` | `2` | Indentation width in spaces |

Path parameters are resolved from each parameter's `example`/`schema.example`, falling back to the `{name}` placeholder. Request bodies are synthesized from the `application/json` `example`, `schema.example`, or the schema's properties. An unknown `target` throws.

---

## generateAllSnippets

Generate one snippet per operation across an entire spec.

```typescript
import { generateAllSnippets } from "@apifn/snippets";

const { snippets } = generateAllSnippets(openApiDoc, {
  target: "python-requests",
  baseUrl: "https://api.example.com",
});

for (const s of snippets) {
  console.log(`# ${s.method.toUpperCase()} ${s.path}`);
  console.log(s.code);
}
```

Each `OperationSnippet` is `{ path, method, operationId?, target, code }`.

---

## Exports

```typescript
export { generateSnippet, generateAllSnippets, SUPPORTED_TARGETS }
export type { SnippetContext, OperationSnippet, AllSnippetsResult, SnippetTargetGenerator }
// SnippetTarget and SnippetOptions are re-exported from @apifn/core
```

## License

MIT
