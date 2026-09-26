---
title: Express
description: Mount FileFn with the shared Express adapter and preserve upload bytes.
---

# Express

Follow the [Express quickstart](/docs/quickstart/express) for a complete local setup. After creating `fileFn` with an explicit storage adapter, mount its router:

```ts
import express from "express";
import { toExpress } from "@superfunctions/http-express";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";

const fileFn = createFileFn({
  db: memoryAdapter(),
  storage: createLocalStorageAdapter({ rootDir: "./.filefn-storage" }),
});
const app = express();
app.use("/filefn", express.raw({ type: "*/*", limit: "10mb" }), toExpress(fileFn.router));
app.listen(3000);
```

The raw parser preserves binary chunk bodies. Set its limit above the maximum accepted chunk size and within the deployment's memory/request budget. The adapter strips the Express mount prefix and passes a Web Request to FileFn. Configure policies and authentication before allowing uploads; the snippet above only mounts the kernel.

Use host CSRF protection for cookie-authenticated writes and the kernel's authorization and upload-token checks. Keep unrelated JSON middleware scoped so it does not consume binary upload bodies. See [rate limiting](/docs/features/rate-limiting) and [storage adapters](/docs/adapters/storage).
