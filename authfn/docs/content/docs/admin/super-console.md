---
title: Super Console integration
description: Bind scoped AuthFn user and session operations to an authorized operator.
---

# Super Console integration

`@authfn/admin` exports two distinct surfaces. The [direct admin routes](/docs/admin) accept an application `authorize` callback. The Super Console capability exposes users and sessions through the shared admin dispatcher, and `createAuthFnOperatorAuth` supplies operator sign-in, two-factor completion, sign-out, scope authorization, and mutation checks.

## Scoped capability

The capability lists and gets users in the configured namespace and active region, deletes an in-scope user, lists that user's active sessions, and revokes a session. The host binds `createAuthFnAdminService(authFnConfig)` to `createAuthFnAdminAdapter(service)` and mounts the adapter in its authenticated Super Console dispatcher. `createAuthFnAdminClient(adminClient)` supplies typed calls for the same operations.

| Operation | Permission | Safety |
| --- | --- | --- |
| List or get users | `authfn.users.read` | Read, audited |
| Delete user | `authfn.users.delete` | Destructive, MFA confirmation, audited |
| List user sessions | `authfn.sessions.read` | Read, audited |
| Revoke session | `authfn.sessions.revoke` | Destructive, recent-auth confirmation, audited |

User deletion permanently removes the user and owned authentication state. Do not expose the capability without scope, permission, confirmation, and audit enforcement. The capability's namespace and region checks are additional to the host's operator authorization.

## Operator authentication

`createAuthFnOperatorAuth` takes an AuthFn config plus two host callbacks: `resolveOperator` maps an authenticated AuthFn session to an allowed console operator, and `authorizeScope` checks a requested admin scope. The integration uses the configured AuthFn plugins, hooks, rate limits, two-factor flow, CSRF policy, and cookie names. An ordinary signed-in AuthFn user does not become a console operator unless `resolveOperator` approves that session.

The [capability source](https://github.com/21nCo/super-functions/blob/dev/authfn/admin/src/index.ts) defines the operation schemas. The [operator integration source](https://github.com/21nCo/super-functions/blob/dev/authfn/admin/src/superconsole.ts) defines authentication and scope callbacks. Use the [direct route guide](/docs/admin) when a custom internal tool needs only user list and delete routes.
