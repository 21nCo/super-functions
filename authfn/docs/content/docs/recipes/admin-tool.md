---
title: Building an admin tool
description: Mount @authfn/admin behind your corporate IAM and ship a UI for support.
---

# Building an admin tool

## Goal

Give your support team a UI to look up and delete users, gated behind your corporate IAM (Okta, Entra, in-house OIDC, …).

## Stack

- `@authfn/admin` for the routes.
- Your existing IAM for authentication / authorization.
- A small Svelte / React UI.

## Authorization callback

```ts
import { createAuthFnAdmin } from '@authfn/admin';

const admin = createAuthFnAdmin({
  authFnConfig: auth.config,
  authorize: async (ctx, input) => {
    const user = await yourCorporateAuth.authenticate(ctx.request);
    if (!user) return false;

    if (input.operationId === 'deleteAuthFnAdminUserById' && !user.permissions.includes('users:delete')) {
      return false;
    }

    return { allowed: true, actorId: user.id, metadata: { roles: user.roles } };
  },
});
```

## Mount

Mount under a path that your reverse proxy gates on the corporate VPN / SSO:

```ts
app.route('/internal/auth-admin', toHono(admin.router));
```

## UI

The UI is a thin shell over the admin routes:

- `GET /internal/auth-admin/users?search=ada@` — search.
- `DELETE /internal/auth-admin/users/:userId` — delete by id.
- `DELETE /internal/auth-admin/users?email=ada@example.com` — delete by email.

Always confirm destructive actions:

```svelte
<button on:click={() => confirmAndDelete(user)}>Delete</button>

<script>
  async function confirmAndDelete(user) {
    if (!confirm(`Permanently delete ${user.primaryEmail}?`)) return;
    await fetch(`/internal/auth-admin/users/${user.id}`, { method: 'DELETE' });
  }
</script>
```

## Audit

Every admin action emits an `authfn.account.deleted` event with the `actorId` your `authorize` callback returned. Pipe this to your immutable audit log for compliance use cases.

## Related

- [Admin](../admin)
- [Concepts → Observability](../core-concepts/observability)
