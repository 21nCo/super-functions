# PlugFn Client SDK Boundary

## Current status

PlugFn publishes a thin browser-safe helper as `@plugfn/client`.

The default contract is server-side:

- provider credentials stay on the server
- OAuth token exchange stays on the server
- webhook verification stays on the server
- privileged provider actions stay on the server

## Browser-safe operations

Only the following operations are allowed in the browser-facing helper:

- `listProviders`
- `startConnection`
- `listConnections`
- `getConnection`
- `getConnectionStatus`
- `disconnect`
- `createSyncJob`
- `listSyncJobs`
- `getSyncJob`
- `cancelSyncJob`
- `upsertCheckpoint`

These operations intentionally call the server-side PlugFn routes. The browser package must not contain provider credentials, token exchange code, webhook verification code, or direct provider API clients.

## Server-only operations

The following operations remain server-only and must not move into a browser package:

- token exchange
- token refresh
- direct credentialed provider actions
- workflow execution
- webhook signature verification
- provider secret resolution

Browser attempts to perform server-only operations should be treated as contract violations.
