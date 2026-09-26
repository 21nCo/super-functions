---
title: HTTP routes
description: Mount model and trace endpoints with trusted authentication.
---

# HTTP routes

`createLangFnRouter(lang, options)` uses `@superfunctions/http` and defaults to a one MiB JSON body limit. The route set includes `GET /health`, `POST /complete`, `POST /chat`, `POST /stream`, `POST /embed`, `GET /traces`, and `POST /feedback`. The host mounts the router and supplies authentication and rate-limit providers appropriate to its deployment.

Trace listing and feedback require an authenticated actor. Their stored and queried scope comes from trusted session metadata, not request-supplied tenant or user values. Custom trace stores serving scoped HTTP access must advertise `supportsScope: true`, apply both tenant and user predicates before pagination, and implement scoped `findOne` for feedback ownership. Historical unowned traces do not appear in HTTP results.

HTTP provider errors omit upstream response bodies and metadata. SSE client disconnects cancel model work. See the [source router](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/http/routes.ts) and [release gate](/docs/reference/release-gate) for exact input and scope rules.

## Mount an authenticated Node server

```sh
npm install langfn express @superfunctions/http-express
npm install --save-dev tsx
```

This local single-user example requires `LANGFN_DEMO_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL` in the server environment. Save it as `server.ts` and run `npx tsx server.ts`:

```ts
import express from "express";
import { LangFn } from "langfn";
import { OpenAIChatModel } from "langfn/models";
import { createLangFnRouter } from "langfn/http";
import { toExpress } from "@superfunctions/http-express";

const token = process.env.LANGFN_DEMO_TOKEN;
if (!token || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  throw new Error("Set the demo token, provider key, and model");
}
const lang = new LangFn({ model: new OpenAIChatModel({
  apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
}) });
const router = createLangFnRouter(lang, {
  auth: {
    validateBearerToken(value) {
      return value === token ? {
        id: "local-session", type: "bearer",
        subject: { actorId: "local-user", actorType: "user", tenantId: "local" },
      } : null;
    },
  },
  maxBodyBytes: 1024 * 1024,
});
const app = express();
app.use(express.raw({ type: "application/json", limit: "1mb" }));
app.use("/api/langfn", toExpress(router));
app.listen(3020);
```

```sh
curl http://localhost:3020/api/langfn/complete \
  -H "Authorization: Bearer $LANGFN_DEMO_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Describe optimistic concurrency in one sentence."}'
```

Read the response envelope and check `ok` before using its data. Invalid credentials return an authentication error; oversized requests are rejected. In production, replace the demo token check with the host's session provider and configure the rate-limit provider. Keep model credentials server-side and configure scoped trace storage before enabling trace/feedback features. The mount prefix belongs to the HTTP adapter; the LangFn router's routes remain `/complete`, `/chat`, and so on.
