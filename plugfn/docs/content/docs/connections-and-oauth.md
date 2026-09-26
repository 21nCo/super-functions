---
title: Connections and OAuth
description: Start, inspect, and disconnect owned provider connections.
---

# Connections and OAuth

Register a provider and its application credentials on the server. A user starts a connection through an authenticated route, completes the provider OAuth flow, and returns through PlugFn's callback routes. PlugFn stores connection state and encrypted tokens through its configured storage.

The TypeScript router exposes provider discovery, connection list/get/status, start, and disconnect routes. For non-webhook routes, it derives the principal from `auth.authenticate` unless a router override is supplied. Caller-provided `userId` and `tenantId` values are checked against that principal and rejected on mismatch.

See the [source setup guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/getting-started.md) for route inventory and the [OAuth incident runbook](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/oauth-incident.md) for operations.
