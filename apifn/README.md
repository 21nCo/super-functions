# ApiFn

ApiFn is a code-first, self-hosted API development toolkit. Generate OpenAPI specs from your router, diff them for breaking changes, run collection-based test suites, mock endpoints, embed interactive API docs, and gate it all in CI — without leaving your codebase.

Your router is the source of truth: introspect it into OpenAPI 3.1, then drive validation, diffing, testing, mocking, snippets, and documentation from the same spec.

## Packages

| Package | Description |
|---------|-------------|
| [`@apifn/core`](./core) | Route introspection, schema conversion (Zod/TypeBox → JSON Schema), OpenAPI 3.1 generation, diff, and ecosystem integrations. Every package depends on it. |
| [`@apifn/cli`](./cli) | The `apifn` command — generate, export, import, validate, diff, test, mock, serve, snippet. |
| [`@apifn/collections`](./collections) | OpenCollection YAML read/write/run: portable request collections with assertions, scripting, and reporters. |
| [`@apifn/mock`](./mock) | Zero-dependency mock server from any OpenAPI spec, with schema/example/random responses and request validation. |
| [`@apifn/snippets`](./snippets) | Generate request code snippets for 11 languages/clients (curl, fetch, axios, Python, Go, Java, …). |
| [`@apifn/react`](./react) | React components — interactive API explorer, Try-It console, schema viewer, diff, performance overlays. |
| [`@apifn/svelte`](./svelte) | The same UI surface for Svelte, shipped as `.svelte` source. |
| [`@apifn/docsfn`](./docsfn) | docsfn plugin — render an OpenAPI spec as an interactive API reference. |

## Quick Start

Install the CLI and scaffold a collection:

```bash
npm install --save-dev @apifn/cli
npx apifn init .apifn/collection
```

Generate an OpenAPI document from your `@superfunctions/http` router:

```typescript
// apifn.config.ts
import { defineConfig } from "@apifn/cli";

export default defineConfig({
  router: "./src/router.ts",
  output: ".apifn",
  openapi: {
    info: { title: "My API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
  },
});
```

```bash
apifn generate                          # → .apifn/openapi.yml
apifn validate .apifn/openapi.yml       # validate the document
apifn mock .apifn/openapi.yml           # mock server on :4010
apifn serve .apifn/openapi.yml          # interactive explorer on :4100
apifn test .apifn/collection            # run collection tests
```

Or use the library directly:

```typescript
import { fromRouter, diffOpenAPI, formatDiffAsText } from "@apifn/core";

const doc = fromRouter(router, {
  info: { title: "My API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
});

const result = diffOpenAPI(baselineDoc, doc);
console.log(formatDiffAsText(result));
```

## Ecosystem Integrations

`@apifn/core` ships first-class hooks into the wider Superfunctions stack:

- **watchfn** — per-endpoint performance metrics and request telemetry
- **authfn** — mint short-lived test tokens and inject auth into collection runs
- **secfn** — read rate-limit state for endpoints
- **logfn** — structured run reporting and a CLI logger
- **testfn** — an adapter that discovers and runs collections as test cases

## CI/CD

ApiFn provides a reusable GitHub Actions workflow at `apifn/.github/workflows/api-check.yml`.

### What it does

- Validates OpenAPI specs via `apifn validate --format json`
- Diffs current spec against base branch via `apifn diff --format json`
- Runs collection tests via `apifn test --reporter json`
- Emits machine-readable JSON artifacts (`validate-report.json`, `diff-report.json`, `test-report.json`)
- Builds a markdown summary and posts/updates a PR comment (optional)
- Enforces non-zero exits for validation failures, breaking changes, and test failures

### Inputs

- `spec_path` (required): Repo-relative OpenAPI path (e.g. `.apifn/openapi.yml`)
- `collection_dir` (required): Repo-relative OpenCollection directory (e.g. `.apifn/collection`)
- `environment` (optional, default `development`): Collection environment
- `base_branch` (optional, default `main`): Branch used to fetch baseline spec
- `fail_on_breaking` (optional, default `true`): Whether breaking diff exits non-zero
- `post_pr_comment` (optional, default `true`): Whether to post/update PR summary comment

### Example

See [`apifn/examples/ci-cd/github-actions.yml`](./examples/ci-cd/github-actions.yml).

### Non-GitHub CI

For GitLab/Jenkins/Buildkite, run the same CLI commands directly:

```bash
apifn validate .apifn/openapi.yml --format json
apifn diff .apifn/base-openapi.yml .apifn/openapi.yml --format json
apifn test .apifn/collection --env development --reporter json
```

## License

MIT
