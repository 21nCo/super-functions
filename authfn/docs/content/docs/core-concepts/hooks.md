---
title: Hooks
description: Lifecycle callbacks that let you intercept and augment authfn flows — before/after user creation, session issuance, OTP send, OAuth start/callback, and account deletion.
---

# Hooks

Hooks are the supported extension surface for cross-cutting concerns. They let you:

- enforce custom validation (e.g. block sign-ups from disposable email domains),
- augment user records on creation (assign a tenant, copy from a CRM),
- attach metadata to sessions (issue id, user-agent class),
- trigger side effects (push to your audit log, send a welcome email),
- abort flows (deny sign-in for a deactivated account).

Hooks are configured at the kernel level (`config.hooks`) and at the plugin level (`plugin.hooks`). Both run; kernel hooks run first.

## The hook surface

```ts
interface AuthFnHooks {
  // User lifecycle
  beforeUserCreate(ctx, input): Promise<input | void> | input | void;
  afterUserCreate(ctx, user): Promise<void> | void;

  // Session lifecycle
  beforeSessionIssue(ctx, input): Promise<input | void> | input | void;
  afterSessionIssue(ctx, session): Promise<void> | void;

  // OTP delivery
  beforeChallengeSend(ctx, input): Promise<input | void> | input | void;
  afterChallengeSend(ctx, result): Promise<void> | void;

  // OAuth
  beforeOAuthStart(ctx, input): Promise<input | void> | input | void;
  afterOAuthCallback(ctx, result): Promise<void> | void;

  // Account deletion
  beforeAccountDelete(ctx, input): Promise<input | void> | input | void;
  afterAccountDelete(ctx, result): Promise<void> | void;
}
```

Every hook receives an `AuthFnHookContext` as its first argument:

```ts
interface AuthFnHookContext {
  config?: AuthFnConfig;
  request?: Request;
  runtime?: AuthFnRuntimeResolution;
  pluginName?: string;
  session?: AuthFnSession;
  actorId?: string;
}
```

`request`, `runtime`, and `pluginName` are populated when the hook is fired from a request-handling path. They may be undefined when invoked from kernel utilities (e.g. an internal `issueSession` call from a custom plugin).

## `before*` vs `after*`

- **`before*`** hooks are *intercepting*. They can:
  - return a (possibly modified) input — the kernel uses the returned value going forward;
  - return `void` — the kernel uses the original input;
  - throw — the kernel translates to an `AUTHFN_PLUGIN_ABORTED` (or your typed `AuthFnError`).

- **`after*`** hooks are *observing*. Their return value is ignored. Throws can either fail the response or be observed (see [Plugins → hook failure policy](./plugins#hook-failure-policy)).

## When each hook fires

| Hook | Fires |
| --- | --- |
| `beforeUserCreate` | Right before the kernel writes a new user record. Fires for password sign-up, OTP sign-up, and OAuth sign-up. |
| `afterUserCreate` | Right after the user is persisted. |
| `beforeSessionIssue` | Right before a session record is written (every method that issues a session). |
| `afterSessionIssue` | Right after the session is written. Cookie issuance and event emission have already happened. |
| `beforeChallengeSend` | Right before an OTP is generated and delivery is invoked. Email-OTP flows only. |
| `afterChallengeSend` | After the delivery provider returns. |
| `beforeOAuthStart` | When the user hits `POST /auth/oauth/:provider/start`, after redirect-uri checks, before persisting state. |
| `afterOAuthCallback` | After the kernel has resolved the OAuth identity and either created/linked a user. Fires before session issuance. |
| `beforeAccountDelete` | When `DELETE /auth/account` is called, after authentication. |
| `afterAccountDelete` | After the cascading delete completes. |

## Examples

### Block disposable emails

```ts
import { AuthFnValidationError } from '@authfn/core';
import { isDisposable } from './disposable.js';

createAuthFn({
  // ...
  hooks: {
    beforeUserCreate(_ctx, input) {
      if (isDisposable(input.primaryEmail)) {
        throw new AuthFnValidationError('disposable email addresses are not allowed', {
          field: 'email',
        });
      }
    },
  },
});
```

### Stash request fingerprint on every session

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

### Send a welcome email after sign-up

```ts
hooks: {
  async afterUserCreate(_ctx, user) {
    await yourMailer.sendWelcome({ to: user.primaryEmail, userId: user.id });
  },
},
hookFailurePolicy: {
  afterUserCreate: 'observe',  // don't fail sign-up if the welcome email fails
},
```

### Audit-log every authentication

```ts
hooks: {
  async afterSessionIssue(ctx, session) {
    await audit.log({
      requestId: ctx.request?.headers.get('x-request-id'),
      event: 'session_issued',
      userId: session.actorId,
      methods: session.methods,
    });
  },
}
```

### Abort sign-in for deactivated accounts

```ts
import { AuthFnPluginAbortedError } from '@authfn/core';

hooks: {
  async beforeSessionIssue(_ctx, input) {
    const flag = await db.users.deactivatedAt(input.userId);
    if (flag) {
      throw new AuthFnPluginAbortedError('account deactivated', {
        deactivatedAt: flag,
      });
    }
  },
}
```

## Ordering

Hooks run in this order:

1. Kernel-level `config.hooks.before*`.
2. Plugin-level `plugin.hooks.before*`, in the order plugins were declared.
3. The plugin's actual handler.
4. Plugin-level `plugin.hooks.after*`, in the order plugins were declared.
5. Kernel-level `config.hooks.after*`.

If any `before*` returns a modified input, every subsequent `before*` and the handler see the new input.

## Failure policy

By default, throws from any hook fail the request. To downgrade specific `after*` hooks to "observe", use `hookFailurePolicy`:

```ts
createAuthFn({
  // ...
  hooks: {
    afterUserCreate: pushToCrm,
  },
  // (kernel-level hooks have an implicit 'fail' policy; opt out per hook below)
  // — or, if defining on a plugin:
});
```

Plugin-authored `afterUserCreate` hooks set their own `hookFailurePolicy.afterUserCreate = 'observe'`. See [Plugins → Authoring](../plugins/authoring).

When a hook fails under the `'observe'` policy, an `authfn.plugin.failed` event is emitted with the hook name, plugin name, and a redacted error payload.

## Hooks vs plugins

Hooks are great for **cross-cutting concerns** — anything that's relevant across multiple flows. If your concern is its own primitive (a new sign-in method, a new resource type), [author a plugin](../plugins/authoring) instead. Plugins can also use hooks internally for the same purposes.

## Related

- [Plugins](./plugins) — plugin lifecycle, ordering, hook failure policy.
- [Errors](./errors) — error classes to throw from `before*`.
- [Observability](./observability) — `authfn.plugin.failed` event.
- [Recipes → Custom validation](../recipes/custom-validation) — common hook-based patterns.
