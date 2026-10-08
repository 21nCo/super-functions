---
title: Packages
description: Current BotFn package map and public entry points.
---

| Package | Role and public entry point |
| --- | --- |
| `@superfunctions/botfn-discord-bot` | Cloudflare Discord interactions Worker; root exports the compiled app, `/core` exports `createBotApp`. |
| `@superfunctions/botfn-bot-slack` | Private Slack events Worker; repository entry `botfn/bot-slack/src/index.ts`, not an npm consumer API. |
| `@superfunctions/botfn-persistence-service` | PostgreSQL-backed tRPC Worker; `/client` exports `createPersistenceClient`, `/core` exports `createPersistenceApp`. |
| `@superfunctions/botfn-discord-core` | Discord signature verification and interaction helpers. |
| `@superfunctions/botfn-slack-core` | Slack signature verification. |
| `@superfunctions/botfn-github-integration` | GitHub App auth, request client, and one-off requests. |
| `@superfunctions/botfn-linear-integration` | Linear GraphQL client and issue/team helpers. |
| `@superfunctions/botfn-shared-types` | Shared Zod schemas and TypeScript types. |
| `@superfunctions/botfn-admin` | Optional Super Console capability, client, adapter, and operator service. |

Public BotFn libraries use the controlled `@superfunctions/botfn-*` namespace.
The old `@botfn` npm user scope belongs to an unrelated account; no compatibility
aliases are provided. The private documentation workspace remains `@botfn/docs`
and is not a published library.

Discord core, GitHub, Linear, and shared-types packages export compiled ESM and
TypeScript declarations, not TypeScript source. The Discord bot and persistence
service also export compiled ESM and declarations; import the persistence client
from `@superfunctions/botfn-persistence-service/client`, never `/src/client`.
Slack core provides compiled ESM and CommonJS. Build source checkouts before using
these exports or packing them; do not substitute source deep imports.

The Discord bot depends on the shared-types, discord-core, GitHub, Linear, and
persistence-service foundations at their declared versions. Install or release
those prerequisites first. Local workspace builds verify source compatibility,
not registry publication or a running Worker.
