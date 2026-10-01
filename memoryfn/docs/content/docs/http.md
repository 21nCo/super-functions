---
title: HTTP adapter
description: Mount the authorized MemoryFn router and understand its request boundary.
---

Import `createMemoryRouter` from `@memoryfn/core/http` and supply an `authorize(request)` callback. It must authenticate **every request** and return trusted `{ tenantId, containerTags }` or `null`. The request body cannot choose a tenant.

```ts
import { createMemoryRouter } from "@memoryfn/core/http";

const router = createMemoryRouter(memory, {
  authorize: async (request) => {
    const principal = await authenticateRequest(request);
    return principal
      ? { tenantId: principal.tenantId, containerTags: principal.allowedTags }
      : null;
  },
  maxBodyBytes: 1024 * 1024,
});
```

The router matches the exact paths it sees. If the host mounts it under a prefix such as `/api`, the host must strip that prefix before calling `handle`; the router has no mount-prefix option. It exposes `POST /v1/memories` with `content`, optional `containerTags`, and optional `metadata`; and `POST /v1/memories/search` with `q`, optional tags, filters, limit, and threshold. Body tags add constraints to the trusted host tags. Inputs are strict: a body `tenantId` is rejected, as are unknown fields. The limit is 1–100 and threshold is -1 to 1. Missing authorization returns 401; schema-invalid JSON returns 400. Malformed JSON fails before schema validation and currently reaches the shared router’s 500 handler. The default body cap is one MiB.

The router does not supply membership checks or a token verifier. The application must implement those in `authorize` and recheck current permission and deletion state before returning search results. The [source router](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/http/router.ts) is the precise endpoint contract.
