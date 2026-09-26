---
title: Security boundaries
description: Keep credentials and privileged work on the server.
---

# Security boundaries

Provider secrets, refresh tokens, OAuth exchange, webhook signature checks, direct provider API calls, and workflow execution belong on the server. Use a deployment secret store for `encryptionKey` and provider credentials. A browser may call only the owned routes exposed by `@plugfn/client`.

Authentication identifies the caller; authorization still has to enforce user, tenant, and organization ownership at each route and admin action. For inbound email connectors, PlugFn owns account connections and ingestion, while programmable inboxes belong to MailFn and outbound delivery to SendFn.

See the [client contract](/docs/reference/client-boundary) and [provider readiness matrix](/docs/reference/readiness).
