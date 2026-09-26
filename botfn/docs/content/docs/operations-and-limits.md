---
title: Operations and limits
description: Deployment responsibilities and current feature boundaries.
---

# Operations and limits

The Discord bot and persistence service are independent Workers. Set secrets in the correct Worker, provision PostgreSQL separately, and replace any checked-in URL with the actual service endpoint. Local typechecks and docs builds do not prove Discord, Slack, GitHub, Linear, Cloudflare, or PostgreSQL deployment behavior.

The Discord app verifies signatures before handling interactions. It defers commands and edits their responses after external API calls. Persistence errors are logged and suppressed, so monitor and reconcile missing records. The GitHub helper uses installation tokens; the Linear helper uses the configured API key. Check the scope and rotation of those credentials in your host environment.

The Slack Worker only verifies and acknowledges events. Its token binding is unused. The top-level BotFn README and architecture note include older path and platform examples that have no matching entry points in this checkout. Consult the [package map](/docs/reference/packages) before copying commands from those files.

The persistence tRPC route does not authenticate callers or partition by tenant. Protect the service before public exposure. The admin capability has its own scoped store contract and does not automatically share the persistence schema. Do not assume that connecting an admin channel deploys or configures a Discord or Slack Worker.
