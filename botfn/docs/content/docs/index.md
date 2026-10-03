---
title: BotFn
description: Build and operate Discord and Slack bot integrations.
---

BotFn contains a Discord issue-linking bot, a small Slack event receiver, shared platform helpers, a PostgreSQL persistence service, and an optional Super Console administration capability. These are separate packages and services, not one deployable bot.

The Discord Worker verifies signed interactions, acknowledges slash commands, then calls GitHub or Linear and optionally records issue-to-thread relationships. The Slack Worker verifies signed requests and acknowledges events; it does not yet implement command or event business actions. Start with [getting started](/docs/getting-started), then read the [Discord](/docs/discord-bot), [Slack](/docs/slack-bot), and [persistence](/docs/persistence) guides.

These pages follow the current `origin/dev` package layout. The top-level BotFn README still describes an older nested monorepo layout; use the [package map](/docs/reference/packages) and actual package entry points here when integrating. Deployments, external credentials, and hosted database state require separate verification.
