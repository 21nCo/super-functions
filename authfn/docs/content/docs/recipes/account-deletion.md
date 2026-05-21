---
title: Account deletion
description: Cascade-delete a user across every plugin's tables.
---

# Account deletion

## Goal

Delete the current user and every related record — sessions, password credential, OAuth identities, API keys, 2FA enrollments, region profile.

## Endpoint

```ts
await client.deleteAccount();
```

This calls `DELETE /auth/account`. Authenticated; CSRF-protected; cascade is atomic.

## What gets deleted

The kernel walks every enabled plugin's schema and deletes rows linked to the user. The response carries per-table counts:

```jsonc
{
  "ok": true,
  "data": {
    "deleted": true,
    "userId": "user_123",
    "primaryEmail": "ada@example.com",
    "counts": {
      "sessions": 4,
      "password_credentials": 1,
      "oauth_accounts": 2,
      "api_keys": 3,
      "two_factor_enrollments": 1,
      "two_factor_recovery_codes": 10,
      "two_factor_challenges": 0,
      "otp_challenges": 0,
      "region_profiles": 1,
      "handoff_codes": 0
    }
  },
  "requestId": "..."
}
```

## Hooks

`beforeAccountDelete` and `afterAccountDelete` fire around the cascade. Use them to:

- enforce a confirmation step ("type DELETE to confirm" — verify in `beforeAccountDelete`),
- archive the user record to cold storage (`afterAccountDelete`),
- notify your CRM / billing system.

```ts
hooks: {
  async afterAccountDelete(ctx, result) {
    await archive.user({ userId: result.userId, primaryEmail: result.primaryEmail });
  },
},
```

## Related

- [Concepts → Hooks](../core-concepts/hooks)
- [Concepts → Observability](../core-concepts/observability) — `authfn.account.deleted` event.
