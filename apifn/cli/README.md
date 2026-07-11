# @apifn/cli

CLI tools for ApiFn. Generate OpenAPI specs from your router, diff them for breaking changes, validate documents, run collection test suites, mock APIs, serve an interactive explorer, and generate code snippets — all from one `apifn` command.

## Installation

```bash
npm install --save-dev @apifn/cli
# or run ad-hoc
npx @apifn/cli --help
```

## Commands

| Command | Description |
|---------|-------------|
| `init [dir]` | Scaffold a new OpenCollection directory |
| `generate [router]` | Generate an OpenAPI document from a router |
| `export [format] [output]` | Export a generated spec as YAML or JSON |
| `import <kind> <source>` | Import an OpenAPI document as an OpenCollection |
| `test [collectionDir]` | Run a collection's tests |
| `diff <before> <after>` | Compare two specs for breaking changes |
| `validate <specPath>` | Validate an OpenAPI document |
| `serve [specPath]` | Serve an interactive API explorer |
| `mock <specPath>` | Start a mock server from a spec |
| `snippet <specPath> [apiPath]` | Generate a code snippet for an endpoint |

### Global options

`--config <path>` (default `apifn.config.ts`) · `--verbose` · `--quiet` · `--no-color`

---

## init

Scaffold an OpenCollection directory with a `development` environment and a sample request.

```bash
apifn init .apifn/collection --yes
```

- `--yes` — skip interactive prompts (name, base URL)
- `--force` — allow initializing into a non-empty directory

## generate

Generate an OpenAPI document from a `@superfunctions/http` router. The router comes from the argument or `config.router`.

```bash
apifn generate ./src/router.ts --output .apifn/openapi.yml
```

- `--output <path>` — output path (default `<config.output>/openapi.yml`, i.e. `.apifn/openapi.yml`)

`info` defaults to `{ title: "API", version: "1.0.0" }`, merged with `config.openapi.info` and `config.openapi.servers`.

## export

Re-serialize a generated spec.

```bash
apifn export json openapi.json --input .apifn/openapi.yml
```

- `format` — `yaml` (default) or `json`
- `--input <path>` — input spec (default `<config.output>/openapi.yml`)

## import

Import an OpenAPI document (file path or `http(s)` URL) as an OpenCollection.

```bash
apifn import openapi ./openapi.yml --output .apifn/collection --group-by tag
```

- `--output <dir>` — output directory (default `.`)
- `--base-url <url>` — base URL for the generated environment
- `--env <name>` — environment name (default `development`)
- `--group-by <mode>` — `tag` (default) or `path`
- `--force` — allow writing into a non-empty directory

## test

Run a collection's requests and assertions.

```bash
apifn test .apifn/collection --env development --reporter json --output test-report.json
```

| Option | Description |
|--------|-------------|
| `--env <name>` | Environment (defaults to the first defined) |
| `--bail` | Stop on first failure |
| `--parallel` | Run requests concurrently |
| `--concurrency <n>` | Max concurrent requests |
| `--timeout <ms>` | Per-request timeout |
| `--include <pattern>` / `--exclude <pattern>` | Filter requests (repeatable) |
| `--retries <n>` | Retry failed requests |
| `--delay <ms>` | Delay between sequential requests |
| `--env-var <KEY=value>` | Override an environment variable (repeatable) |
| `--dotenv <path>` | Load a dotenv file as overrides |
| `--redact-header <name>` | Additional header to redact (repeatable) |
| `--output <path>` | Write a machine-readable report |
| `--reporter <type>` | `console` (default), `json`, `junit`, `silent` |

Exit codes: `0` all passed · `1` failures/errors · `2` load/run error.

## diff

Compare two specs (file paths or URLs) for breaking changes.

```bash
apifn diff base-openapi.yml openapi.yml --format json
```

- `--format <type>` — `text` (default) or `json`
- `--fail-on-breaking` — exit `1` on breaking changes (default `true`)

Exit codes: `0` no breaking changes · `1` breaking detected · `2` load/parse error.

## validate

```bash
apifn validate .apifn/openapi.yml --format json
```

- `--format <type>` — `text` (default) or `json`

Exit codes: `0` valid · `1` validation errors · `2` load/parse error.

## serve

Serve a built-in interactive explorer with live reload (SSE on spec file changes).

```bash
apifn serve .apifn/openapi.yml --port 4100 --open
```

- `--port <port>` — default `4100`
- `--open` — open the browser automatically

## mock

Start a mock server (via [`@apifn/mock`](../mock)).

```bash
apifn mock .apifn/openapi.yml --mode examples --port 4010 --validate-requests --delay 100
```

- `--mode <mode>` — `schema` (default), `examples`, `random`
- `--port <port>` — default `4010`
- `--validate-requests` — validate incoming request bodies
- `--delay <ms>` — add response latency

## snippet

Generate a code snippet for one endpoint or the whole spec (via [`@apifn/snippets`](../snippets)).

```bash
apifn snippet .apifn/openapi.yml /users --method get --target curl
apifn snippet .apifn/openapi.yml --all --target python-requests
```

- `--target <target>` — `curl` (default), `fetch`, `axios`, `python-requests`, … (see `@apifn/snippets`)
- `--method <method>` — HTTP method (default `get`)
- `--base-url <url>` — base URL override
- `--all` — generate snippets for every endpoint

---

## Configuration

Create an `apifn.config.ts` and type it with `defineConfig`:

```typescript
import { defineConfig } from "@apifn/cli";

export default defineConfig({
  router: "./src/router.ts",
  collection: ".apifn/collection",
  output: ".apifn",
  defaultEnvironment: "development",
  openapi: {
    info: { title: "My API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
  },
  diff: { failOnBreaking: true },
  snippets: ["curl", "python-requests"],
});
```

Config files (`.ts`/`.js`/`.mjs`) are loaded at runtime via `jiti`. Unknown fields are rejected.

## Programmatic API

```typescript
import { runCli, loadConfig, defineConfig } from "@apifn/cli";

const exitCode = await runCli(["validate", ".apifn/openapi.yml", "--format", "json"], {
  cwd: process.cwd(),
  stdout: (t) => process.stdout.write(t),
});
```

- `runCli(argv?, { cwd?, stdout?, stderr? })` — run the CLI, returns an exit code
- `loadConfig({ cwd?, configPath? })` — load and validate config
- `defineConfig(config)` — typed config helper

## License

MIT
