---
title: Configuration
description: Load local config files, JSON project settings, and typed environment values.
---

CliFn has separate facilities for a discovered config module, a simple JSON project config store, and environment variables. Choose the one that fits the lifecycle of the consuming CLI.

## Discover a config file

`loadConfig()` searches `config.ts`, `config.js`, `config.mjs`, `config.cjs`, then `config.json` by default. Pass `configPath` for an explicit file, `candidates` for a custom search, `exportNames` for named module exports, and `validate` for a typed value. The result includes both `config` and the resolved `path`.

```ts
import { loadConfig } from "@clifn/core/config-loader";

const loaded = await loadConfig<{ target: string }>({
  cwd: process.cwd(),
  validate(value) {
    if (!value || typeof value !== "object" || !("target" in value)) {
      throw new Error("target is required");
    }
    return value as { target: string };
  },
});
```

The loader accepts local TS, JS, MJS, CJS, and JSON files. TS uses Jiti. Module exports may be direct values, functions, or promises. Remote URLs and unsupported extensions are rejected; failures use `CLIFN_CONFIG_NOT_FOUND`, `CLIFN_CONFIG_INVALID`, or `CLIFN_CONFIG_UNSUPPORTED`. A custom candidate list is limited to 32 entries. `defineConfig()` is an identity helper for typed authoring.

## Store project settings

`createProjectConfig(path?)` provides a JSON store with `read`, `write`, `get`, and `set`. Supply a product-specific path; its default filename is Conduct-specific. Invalid JSON or a non-object shape raises `InvalidConfigError`. It is separate from the discovered module loader.

## Read environment values

`@clifn/core/env` exports `readRequiredStringEnv`, `readStringEnv`, `readIntEnv`, and `readBooleanEnv`. Each accepts an injected `env` map for tests. Defaults, empty-string rules, and integer `min`/`max` are explicit. Errors have `CLIFN_ENV_MISSING`, `CLIFN_ENV_INVALID`, or `CLIFN_ENV_OUT_OF_RANGE` codes. See the [export reference](/docs/reference/exports) for option types.
