---
title: HTTP routes
description: Mount model and trace endpoints with trusted authentication.
---

# HTTP routes

`createLangFnRouter(lang, options)` uses `@superfunctions/http` and defaults to a one MiB JSON body limit. The route set includes `GET /health`, `POST /complete`, `POST /chat`, `POST /stream`, `POST /embed`, `GET /traces`, and `POST /feedback`. The host mounts the router and supplies authentication and rate-limit providers appropriate to its deployment.

Trace listing and feedback require an authenticated actor. Their stored and queried scope comes from trusted session metadata, not request-supplied tenant or user values. Custom trace stores serving scoped HTTP access must advertise `supportsScope: true`, apply both tenant and user predicates before pagination, and implement scoped `findOne` for feedback ownership. Historical unowned traces do not appear in HTTP results.

HTTP provider errors omit upstream response bodies and metadata. SSE client disconnects cancel model work. See the [source router](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/http/routes.ts) and [release gate](/docs/reference/release-gate) for exact input and scope rules.
