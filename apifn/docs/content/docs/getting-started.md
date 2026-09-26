---
title: Getting started
description: Create an OpenAPI contract and exercise it locally.
---

# Getting started

Install the CLI in the application that owns the API:

```sh
npm install --save-dev @apifn/cli
npx apifn init .apifn/collection --yes
```

Point `apifn.config.ts` at your `@superfunctions/http` router. The router is the source of truth for paths, parameters, request bodies, responses, and security.

```ts
import { defineConfig } from "@apifn/cli";

export default defineConfig({
  router: "./src/router.ts",
  output: ".apifn",
  openapi: { info: { title: "My API", version: "1.0.0" } },
});
```

```sh
npx apifn generate
npx apifn validate .apifn/openapi.yml
npx apifn mock .apifn/openapi.yml
npx apifn serve .apifn/openapi.yml
```

Generation targets OpenAPI 3.1. `validate` checks the document; `mock` runs a mock HTTP server; `serve` opens an interactive explorer. Read the [CLI reference](/docs/reference/cli) for flags and defaults.
