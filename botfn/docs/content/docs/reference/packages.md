---
title: Packages
description: Current BotFn package map and entry points.
---

| Package | Role |
| --- | --- |
| `@botfn/discord-bot` | Cloudflare Discord interactions Worker; `botfn/bot-discord/src/index.cloudflare.ts`. |
| `@botfn/bot-slack` | Private Slack events Worker; `botfn/bot-slack/src/index.ts`. |
| `@botfn/persistence-service` | PostgreSQL-backed tRPC Worker and client; `botfn/persistence/src`. |
| `@botfn/discord-core` | Discord signature verification and interaction helpers. |
| `@botfn/slack-core` | Slack signature verification. |
| `@botfn/github-integration` | GitHub App auth, request client, and one-off requests. |
| `@botfn/linear-integration` | Linear GraphQL client and issue/team helpers. |
| `@botfn/shared-types` | Shared Zod schemas and TypeScript types. |
| `@botfn/admin` | Optional Super Console capability, client, adapter, and operator service. |

The GitHub, Linear, Discord core, and shared-types package manifests currently point exports at TypeScript source. The Slack core package builds ESM and CJS outputs. Check a package's manifest and the chosen runtime or bundler before importing it outside this workspace.
