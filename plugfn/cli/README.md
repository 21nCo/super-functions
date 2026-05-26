# PlugFn CLI

Command-line interface for the PlugFn SDK.

## Installation

```bash
npm install -g @plugfn/cli
```

## Commands

### `plugfn init`

Initialize a new PlugFn project.

```bash
plugfn init
plugfn init --directory ./my-project
```

Creates:
- Project structure
- Configuration file (`plugfn.config.ts`)
- Environment template (`.env.example`)
- Example code

### `plugfn generate-types`

Generate TypeScript types for providers.

```bash
# Generate types for a specific provider
plugfn generate-types --provider github --output ./types

# Generate types for all providers
plugfn generate-types --all --output ./types
```

### `plugfn add-provider`

Create a new provider from template.

```bash
plugfn add-provider --name custom-api --auth api-key
plugfn add-provider --name oauth-service --auth oauth2
```

Options:
- `--name`: Provider name (required)
- `--auth`: Auth type (oauth2, api-key, jwt, basic)
- `--output`: Output directory (default: `./src/providers`)

### `plugfn test`

Test configured PlugFn providers. This command surface is still being hardened and should not be treated as a full production-readiness proof yet.

```bash
plugfn test --provider github
plugfn test --provider github --action issues.create
plugfn test --provider github --connection conn-123
```

## Examples

### Initialize a new project

```bash
mkdir my-integration-app
cd my-integration-app
plugfn init
npm install
```

### Create a custom provider

```bash
plugfn add-provider --name shopify --auth api-key
```

This creates a provider template at `src/providers/shopify/index.ts`.

### Generate types

```bash
plugfn generate-types --all
```

## License

Apache-2.0
