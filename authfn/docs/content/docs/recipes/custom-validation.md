---
title: Custom validation hooks
description: Use beforeUserCreate / beforeSessionIssue to enforce organization-specific rules.
---

# Custom validation hooks

## Goal

Reject sign-ups from disposable email domains, restrict sign-up to specific tenants, attach extra metadata — all without forking the kernel.

## Disposable email block

```ts
import { AuthFnValidationError } from 'authfn';

const disposable = new Set(['mailinator.com', 'tempmail.com', /* ... */]);

authApp.createServer({
  database,
  hooks: {
    beforeUserCreate(_ctx, input) {
      const domain = String(input.primaryEmail ?? '').split('@')[1]?.toLowerCase();
      if (disposable.has(domain)) {
        throw new AuthFnValidationError('Disposable email addresses are not allowed', { field: 'email' });
      }
    },
  },
});
```

## Allowlist by domain (workspace apps)

```ts
hooks: {
  beforeUserCreate(_ctx, input) {
    const domain = String(input.primaryEmail ?? '').split('@')[1]?.toLowerCase();
    if (domain !== 'mycompany.com') {
      throw new AuthFnValidationError('Sign-up restricted to mycompany.com');
    }
  },
}
```

## Stamp request fingerprint on every session

```ts
hooks: {
  beforeSessionIssue(ctx, input) {
    return {
      ...input,
      metadata: {
        ...input.metadata,
        userAgent: ctx.request?.headers.get('user-agent') ?? undefined,
        ip: ctx.request?.headers.get('x-forwarded-for') ?? undefined,
      },
    };
  },
}
```

## Block deactivated accounts

```ts
hooks: {
  async beforeSessionIssue(ctx, input) {
    const flag = await db.users.deactivatedAt(input.userId);
    if (flag) {
      throw new AuthFnPluginAbortedError('account deactivated', { deactivatedAt: flag });
    }
  },
}
```

## Send welcome email

```ts
hooks: {
  async afterUserCreate(_ctx, user) {
    await mailer.sendWelcome({ to: user.primaryEmail, userId: user.id });
  },
}
```

Kernel-level `before*` hooks fail the request when they throw. Kernel-level
`after*` hooks such as `afterUserCreate` are observed: a throw emits
`authfn.plugin.failed` but does not fail sign-up, so the welcome-mail hook can
remain a server hook.

## Related

- [Concepts → Hooks](../core-concepts/hooks)
- [Concepts → Plugins](../core-concepts/plugins)
