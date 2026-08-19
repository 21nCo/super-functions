---
title: authfn
description: The most comprehensive authentication library for TypeScript and Python.
---

# authfn

**authfn** is a comprehensive, framework-agnostic authentication library for TypeScript and Python. It provides cookie-backed sessions, password sign-in, email OTP, social OAuth, API keys, two-factor auth, and multi-region routing out of the box — with a plugin-based architecture that lets you use only what you need, without locking you into any specific database, mail provider, or OAuth implementation.

## What's included

- **Sessions** — cookie-based with CSRF protection out of the box; token-based when you need it.
- **Plugins** — enable only the auth strategies your app requires: `password`, `emailOtp`, `socialOAuth`, `apiKeys`, `twoFactor`, `multiRegion`.
- **Database adapters** — bring your own database, mail sender, and OAuth providers.
- **Type-safe SDKs** — first-class TypeScript client, Python SDK, and Svelte stores.
- **Observability** — structured lifecycle events for every sign-in, sign-up, and session change.
- **OpenAPI** — auto-generated request/response schemas based on your enabled plugins.

## Where to go next

- **[Getting Started](./getting-started)** — install, configure, and authenticate your first user in minutes.
- **[Core Concepts](./core-concepts)** — sessions, plugins, regions, observability.
- **[Core (`authfn`)](./core)** — server runtime and plugin reference.
- **[TypeScript Client](./client)** — `@authfn/client` for browsers and Node.
- **[Python SDK](./python)** — Python server integration.
- **[Svelte Bindings](./svelte)** — `@authfn/svelte` stores.
- **[Adapters](./adapters)** — database, mail, and OAuth provider adapters.
- **[API Reference](./api)** — OpenAPI-backed endpoint documentation.
