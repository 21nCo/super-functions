---
title: Express
description: Mount FileFn with a byte-preserving streaming bridge.
---

# Express

Follow the [Express quickstart](/docs/quickstart/express) for a complete local setup. After creating `fileFn` with an explicit storage adapter, mount its router:

```ts
import express from "express";
import { fileFnHandler } from "./filefn-express"; // Copy the bridge from the quickstart.
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";

const fileFn = createFileFn({
  database: memoryAdapter(),
  storage: createLocalStorageAdapter({ rootDir: "./.filefn-storage" }),
});
const app = express();
app.use("/filefn", fileFnHandler(fileFn.router));
app.listen(3000);
```

Use the complete Node 20+ streaming bridge from the [quickstart](/docs/quickstart/express). It consumes the original request stream, preserves binary response bytes, and maps unmatched routes to 404. Express strips the mount prefix from `req.url` before the bridge creates the Web Request. Do not put a JSON or raw body parser before this mount. Configure policies and authentication before allowing uploads; the snippet above only mounts the kernel.

Use host CSRF protection for cookie-authenticated writes and the kernel's authorization and upload-token checks. Keep unrelated JSON middleware scoped so it does not consume binary upload bodies. See [rate limiting](/docs/features/rate-limiting) and [storage adapters](/docs/adapters/storage).
