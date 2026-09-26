---
title: Runtime client
description: Read secrets and materialize sets in trusted processes.
---

Use `@secfn/runtime` only in trusted server, CI, build, or local workflows. Do not bundle a service token or secret values into browser code. Configure the mounted server endpoint, a scoped service token, tenant and optional namespace, and an optional environment:

```ts
import { createSecFnRuntime } from "@secfn/runtime";

const secfn = createSecFnRuntime({
  endpoint: "https://example.com/secfn",
  apiKey: process.env.SECFN_RUNTIME_TOKEN!,
  tenantId: "acme",
  environment: "production",
  cache: { ttlMs: 60_000 },
});

const value = await secfn.get("OPENAI_API_KEY");
const values = await secfn.getSet("service-runtime");
```

`get` reads one secret; `getSet` resolves a set; `preload` warms either form (`set:name` selects a set); `toEnv` returns a set as an object; `toDotEnv` returns formatted text without writing it; and `injectEnv` writes into the current process environment after validating variable names. A per-call `environment` overrides the configured environment. `bypassCache` forces retrieval, and `clearCache()` drops cached entries. The default cache TTL is zero; any positive TTL can temporarily retain a rotated value, so choose it deliberately.

The client calls `GET /runtime/secrets/:key` and `POST /runtime/secret-sets/:name/resolve` under the configured endpoint and expects the SecFn response envelope. See [runtime package reference](/docs/reference/runtime).
