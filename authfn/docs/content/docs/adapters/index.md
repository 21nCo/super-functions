---
title: Adapters
description: Database, mail, and OAuth provider adapters — bring your own.
---

# Adapters

authfn never owns your database, your mail provider, or your OAuth credentials. Instead, you wire in adapters at construction:

- **Database** — anything that implements the `@superfunctions/db` adapter contract (Drizzle, raw Postgres, SQLite, in-memory for tests).
- **Mail** — implement the `delivery.send` callback on the email OTP plugin.
- **OAuth providers** — built-in support for Google, Apple, and GitHub; add more via the social OAuth plugin's provider registry.

> Stub page — fill in with: adapter contracts, in-tree adapters, examples for each.
