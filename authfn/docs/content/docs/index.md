---
title: Welcome to authfn
description: Self-hosted, framework-agnostic authentication for TypeScript and Python. Sessions, OTP, passwords, social OAuth, API keys, 2FA, multi-region — opt in to what you need.
---

# Welcome to authfn

**authfn** is a self-hosted authentication kernel you mount on the stack you already have. Compose a server runtime from a small set of plugins, drop it into your HTTP framework, and call it from typed clients on web, mobile, and Python backends. It runs anywhere Node, Bun, or Python runs — no vendor portal, no per-MAU pricing, no lock-in.

It is intentionally _unopinionated_ where it matters and _opinionated_ where it pays off:

- **Bring your own database.** authfn writes through a pluggable adapter contract; today you can use an in-memory adapter, Drizzle, raw Postgres, SQLite, or a custom adapter you author yourself. Tomorrow's adapter is one interface away.
- **Bring your own mail and OAuth secrets.** authfn never bundles a mail vendor, never assumes Google/Apple/GitHub configuration. You implement `delivery.send` and pass client IDs through configuration.
- **Use only the auth strategies you need.** Email/password, email OTP, social OAuth (Google/Apple/GitHub), API keys, TOTP-based 2FA, and multi-region routing are all plugins. Skipping a plugin removes its routes, schema, and OpenAPI surface entirely.
- **Type-safe end to end.** `authfn` (Node), `@authfn/client` (browsers/Node), `@authfn/svelte` (Svelte stores), `authfn` on PyPI, and `AuthFnSwift` on iOS/macOS speak the same envelopes, error codes, and routes.
- **Observable by default.** Every meaningful action emits a structured event (`authfn.session.issued`, `authfn.oauth.completed`, `authfn.region.lookup`, …) through a single `observability.emit` callback. Sensitive values are redacted before they leave the kernel.
- **Self-hosted.** authfn is an open-source kernel that runs in your own backend. There is no vendor portal, no per-MAU pricing, and no lock-in.

## Pick where to start

If you have **15 minutes**, follow the [Getting Started](./getting-started) tutorial — it runs through `authfn()`, `.createServer()`, plugin enablement, mounting on Hono, and signing in a user from the typed client.

If you want a **per-stack quickstart**, jump to [Quickstart](./quickstart) for setup recipes scoped to your framework: Node + Hono, Bun, SvelteKit, Next.js App Router, Python + FastAPI, Python + Flask, or Swift on iOS.

If you're **comparing tools**, the highlights below are a cheatsheet against Better Auth, Clerk, Auth.js, and DIY auth.

## What's included

| Capability | What it gives you | Plugin |
| --- | --- | --- |
| Cookie sessions | Browser sessions with rotation, idle/absolute timeouts, CSRF double-submit, multi-device session listing and revoke | bundled in `authfn` |
| Token sessions | Bearer-token sessions for non-browser clients (mobile, CLI, server-to-server) | bundled in `authfn` |
| Email & password | Sign-up/sign-in, password reset via OTP, optional compromised-password checks | `@authfn/password` |
| Email OTP | One-time codes for email verification, sign-in, sign-up, and password reset | `@authfn/email-otp` |
| Social OAuth | Google, Apple, GitHub — and custom providers through the shared OAuth contracts | `@authfn/social-oauth` |
| API keys | User-owned API keys with scopes, named, revocable, securely hashed | `@authfn/api-keys` |
| Two-factor (TOTP) | RFC 6238 TOTP with recovery codes, time-window tolerance, and pluggable encryption | `@authfn/two-factor` |
| Multi-region | Region-aware lookup and request-specific runtime environment resolution | `@authfn/multi-region` |
| Native handoff | Web ↔ native session handoff for iOS/Android wrappers | `@authfn/native-handoff` |
| Admin API | List/delete users with custom authorization | `@authfn/admin` |
| OpenAPI | Auto-generated spec from your enabled plugins, served from the kernel | bundled in `authfn` |

## SDK matrix

| SDK | Package | Server / Client | Status |
| --- | --- | --- | --- |
| Server kernel (Node) | `authfn` | Server | Stable |
| TypeScript client | `@authfn/client` | Browser, Node, Bun, Deno | Stable |
| Svelte bindings | `@authfn/svelte` | SvelteKit, Svelte 5 | Stable |
| Python kernel | `authfn` (PyPI) | FastAPI, Flask, Starlette | Stable |
| Swift client | `AuthFnSwift` (SPM) | iOS, macOS — bearer + native handoff | Stable |
| Admin routes | `@authfn/admin` | Server | Stable |

## How is this different from…

- **Better Auth** — authfn shares Better Auth's plugin philosophy and framework-agnostic stance, and adds a Python kernel, multi-region routing as a first-class plugin, native mobile handoff, and a strict canonical envelope/error-code contract enforced across SDKs. authfn does not ship a hosted dashboard or a UI library; it is a kernel.
- **Clerk** — Clerk is a hosted product; authfn is self-hosted. Clerk gives you a polished UI and an opinionated identity model out of the box. authfn gives you full control of your DB schema and zero vendor dependencies.
- **Auth.js / NextAuth** — authfn is framework-agnostic and language-cross-cutting (Node + Python + Swift), with strict envelope contracts and a separate admin package. It does not ship Next-specific helpers.
- **Roll your own** — authfn is the version of "roll your own auth" you would have written if you had three months and an obsession with deterministic events, OpenAPI parity, and CSRF correctness. Use it instead of starting from scratch.

## Where to go next

- [Getting Started](./getting-started) — install, configure, and sign in your first user.
- [Quickstart](./quickstart) — per-framework setup walkthroughs.
- [Core Concepts](./core-concepts) — sessions, plugins, regions, observability, the runtime resolver, and the canonical envelope/error model.
- [Plugins](./plugins) — every bundled plugin documented end to end.
- [SDKs](./sdk) — `authfn`, `@authfn/client`, `@authfn/svelte`, the Python package, and Swift.
- [Adapters](./adapters) — database, mail, and OAuth provider adapters.
- [Frameworks](./frameworks) — Hono, Express, Bun, SvelteKit, Next.js, FastAPI, Flask, Starlette.
- [Recipes](./recipes) — copy-pasteable solutions for common flows.
- [API Reference](./api) — OpenAPI-backed endpoint documentation, generated from a server with every plugin enabled.
- [AI resources](./ai-resources) — `llms.txt`, MCP, and Skills for coding assistants.
