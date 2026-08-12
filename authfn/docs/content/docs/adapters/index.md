---
title: Adapters
description: Database, mail, and OAuth — bring your own. authfn ships only the contracts.
---

# Adapters

authfn never owns your database, your mail provider, or your OAuth credentials. Instead, you wire in **adapters** at construction. The kernel speaks three contracts:

| Concern | Contract | Built-in implementations |
| --- | --- | --- |
| Database | `@superfunctions/db` `Adapter` | memory, Drizzle (Postgres / MySQL / SQLite), raw Postgres, raw SQLite, Cloudflare D1 |
| Mail | `AuthFnDeliveryProvider` | none — you write a `send` function |
| OAuth providers | `OAuthProviderPolicy` | Google, Apple, GitHub |

If you need something that's not bundled, the contracts are intentionally small. See:

- [Database adapters](./database) — built-in adapters and how to write a custom one.
- [Mail adapters](./mail) — drop-in implementations for Resend, Postmark, SendGrid, AWS SES, and a custom contract.
- [OAuth adapters](./oauth) — built-in social providers and how to add your own.

## Why adapters?

The same `AuthFn` instance can run on Cloudflare Workers with D1 + Resend, on AWS Lambda with Postgres + SES, on Bun with SQLite + Postmark, and on Node with Drizzle + your in-house mailer — without changing a single line of plugin or hook code. The kernel only knows about the contracts.

This also means tests run against `memoryAdapter` with a no-op delivery provider, with full fidelity. No mocks, no stubs.
