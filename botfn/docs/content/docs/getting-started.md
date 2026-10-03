---
title: Getting started
description: Find the BotFn package or service that fits your integration.
---

BotFn lives under `botfn/` in the Superfunctions npm workspace. Install dependencies from the repository root, then run scripts for the package you need. The Discord and Slack bot packages each expose a Cloudflare Worker entry point. The persistence package is a separate Worker backed by PostgreSQL.

```sh
npm install
npm --workspace @botfn/discord-bot run dev
npm --workspace @botfn/persistence-service run dev
```

For Discord, register the four slash commands with `npm --workspace @botfn/discord-bot run register-commands` after providing `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in a local `.env`. Configure the Worker secrets and the persistence URL separately. See the [Discord setup](/docs/discord-bot) before deploying.

For Slack, `@botfn/bot-slack` is a private Worker package. Its `/slack/events` route currently handles URL verification and acknowledges signed events; use it as a receiver starting point, not a complete Slack bot. See [Slack setup](/docs/slack-bot).

Consumers building another bot can import platform verification, API helpers, and Zod schemas from the [shared packages](/docs/reference/packages). These packages have distinct exports and lifecycles; the source entry points are the authoritative import surface.
