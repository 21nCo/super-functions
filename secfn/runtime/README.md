# @secfn/runtime

Read-only runtime client and env materialization helpers for SecFn.

Use this package from trusted server, CI, build, and local development workflows. Do not bundle private secrets into browser code.

```ts
import { createSecFnRuntime } from "@secfn/runtime";

const secfn = createSecFnRuntime({
  endpoint: "https://nucleus.example.com/secfn",
  apiKey: process.env.SECFN_RUNTIME_TOKEN!,
  tenantId: "acme",
  environment: "production",
  cache: { ttlMs: 60_000 },
});

const value = await secfn.get("OPENAI_API_KEY");
const env = await secfn.toEnv("nucleus-production");
const dotenv = await secfn.toDotEnv("nucleus-production");
```

`toDotEnv` returns text only. It does not write plaintext to disk.
