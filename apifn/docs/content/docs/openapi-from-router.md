---
title: OpenAPI from a router
description: Use @apifn/core to derive and inspect a contract.
---

# OpenAPI from a router

`@apifn/core` introspects a `@superfunctions/http` router and converts Zod or TypeBox schemas to JSON Schema. `fromRouter` combines introspection and OpenAPI generation.

```ts
import { fromRouter } from "@apifn/core";

const doc = fromRouter(router, {
  info: { title: "My API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  include: ["/v1"],
  exclude: ["/internal"],
});
```

Use `introspectRouter` when you need route descriptions before generation; `generateOpenAPI` accepts those descriptions. Restrict included paths deliberately so internal routes do not enter a public contract. See the [core reference](/docs/reference/core) for schema conversion, parsing, validation, and integration hooks.
