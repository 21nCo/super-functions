---
title: Connections and OAuth
description: Start, inspect, and disconnect owned provider connections.
---

# Connections and OAuth

Register a provider and its application credentials on the server. A user starts a connection through an authenticated route, completes the provider OAuth flow, and returns through PlugFn's callback routes. PlugFn stores connection state and encrypted tokens through its configured storage.

The TypeScript router exposes provider discovery, connection list/get/status, start, and disconnect routes. For non-webhook routes, it derives the principal from `auth.authenticate` unless a router override is supplied. Caller-provided `userId` and `tenantId` values are checked against that principal and rejected on mismatch.

See the [source setup guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/getting-started.md) for route inventory and the [OAuth incident runbook](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/oauth-incident.md) for operations.

## Connect from the browser

After mounting the server at `/api/plugfn`, use the typed client with the host's authenticated cookie session:

```ts
import { createPlugFnClient, PlugFnClientError } from "@plugfn/client";

const client = createPlugFnClient({ baseUrl: "/api/plugfn", credentials: "include" });
const providers = await client.listProviders();
console.log(providers.map((provider) => provider.name));
try {
  const { authUrl } = await client.startConnection({
    provider: "github",
    redirectUri: `${location.origin}/api/plugfn/callback/github`,
    scopes: ["read:user"],
    connectionName: "My GitHub account",
    redirect: "none",
  });
  location.assign(authUrl);
} catch (error) {
  if (error instanceof PlugFnClientError) console.error(error.code, error.status);
  else throw error;
}
```

Choose scopes for the actions your application actually needs; `read:user` above is a minimal connection example and does not authorize private repository operations. The callback URI must match the provider application configuration exactly. Let PlugFn handle the callback and OAuth state; do not manually exchange tokens in the browser.

## Inspect and disconnect

On a subsequent page load, recreate `client` as above:

```ts
const connections = await client.listConnections({ provider: "github" });
for (const connection of connections) {
  console.log(connection.id, connection.name, connection.status);
}
const selected = connections[0];
if (selected) {
  console.log(await client.getConnectionStatus(selected.id));
  // Run only in response to the user's disconnect action:
  await client.disconnect({ provider: "github", connectionId: selected.id });
}
```

Treat `expired`, `revoked`, and `error` status as unavailable until the connection is recovered or reauthorized. `PlugFnClientError` exposes `code`, `status`, `retryable`, and `details`. An ownership mismatch is an authorization failure, not a signal to retry under a different caller-supplied tenant. Connection summaries do not expose provider credentials.
