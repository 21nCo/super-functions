---
title: core — Config
description: loadDocsConfig, defaults, and config validation in @docsfn/core.
---

# Config (`@docsfn/core`)

## `DEFAULT_CONFIG_FILENAMES`

Readonly list of filenames tried under `cwd` when no explicit path is given:

- `docsfn.config.ts`
- `docsfn.config.mjs`
- `docsfn.config.js`

## `LoadDocsConfigInput`

| Field | Type | Description |
| --- | --- | --- |
| `cwd` | `string` | Working directory to resolve from. |
| `configPath` | `string` (optional) | Explicit config file path (absolute or relative to `cwd`). |

## `loadDocsConfig(input)`

- **Returns:** `Promise<DocsConfig>`
- **Behavior:** Discovers a config module, loads it through Jiti (including TypeScript), caches the live export or factory result for the host lifetime, validates with the internal Zod schema, and returns a typed **`DocsConfig`**. If no file exists, returns **`createDefaultDocsConfig({ cwd })`**.
- **Throws:** **`DocsError`** with code **`DOCS_CONFIG_INVALID`** when the file is missing (explicit path), unloadable, or fails schema validation.

**`validateDocsConfig(loadedConfig, configPath?)`** validates an already-loaded value and returns **`DocsConfig`**. `validateConfig` is not an export. Use **`isDocsConfigError`** to narrow caught errors. Restart API/framework hosts after changing config dependencies or repairing evaluation errors; CLI dev builds run in fresh workers.

## `createDefaultDocsConfig({ cwd })`

Builds a minimal valid **`DocsConfig`** for tooling and tests (default dirs, search on, auth off).

## `isDocsConfigError(value)`

Type guard: returns true when `value` is a **`DocsError`** (`name === "DocsError"` with `code`).

## Related types

Full schema fields are described under **[Types](./types)** and **[Configuration](../../core-concepts/configuration)**.
