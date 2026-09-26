---
title: Configuration
description: Runtime bindings and deployment inputs by package.
---

# Configuration

| Component | Required inputs | Notes |
| --- | --- | --- |
| Discord command registration | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | Local `.env` for `register-commands.js`. |
| Discord Worker | `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`, `PERSISTENCE_SERVICE_URL` | Linear commands also need `LINEAR_API_KEY`. |
| Slack Worker | `SLACK_SIGNING_SECRET` | `SLACK_BOT_TOKEN` is declared but unused by the current route. |
| Persistence Worker | `DATABASE_URL` | PostgreSQL schema must be applied separately. |
| Admin service | `BotFnOperatorStore`, `verifyChannel` | Host supplies scope, permissions, audit, and durable storage. |

Store private keys, signing secrets, and API tokens in the platform's secret mechanism. A URL in `wrangler.toml` is configuration, not proof that the service exists or is reachable. The [Discord guide](/docs/discord-bot) and [persistence guide](/docs/persistence) cover setup order.
