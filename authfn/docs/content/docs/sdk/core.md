---
title: "@authfn/core"
description: The Node server kernel — createAuthFn, AuthFnInstance, the plugin contract, and everything you import to build a runtime.
---

# @authfn/core

`@authfn/core` is the server kernel. You create a runtime with `createAuthFn(config)` and mount the resulting `AuthFnInstance.router` on your HTTP framework.

```bash
npm install @authfn/core
```

## `createAuthFn(config)`

```ts
function createAuthFn(config: AuthFnConfig): AuthFnInstance;

interface AuthFnConfig {
  database: Adapter;                         // @superfunctions/db adapter
  cacheStore?: KVStoreAdapter;               // optional cache
  namespace?: string;                        // default: 'authfn'
  basePath?: string;                         // default: '/'
  cookie?: AuthFnCookieConfig;
  accountLinking?: AuthFnAccountLinkingConfig;
  runtime?: AuthFnRuntimeResolver;
  hooks?: Partial<AuthFnHooks>;
  plugins: AuthFnPlugin[];
  openApi?: boolean | { title: string; version: string };
  observability?: AuthFnObservabilityConfig;
}

interface AuthFnInstance {
  router: Router;
  provider: AuthProvider<AuthFnSession>;
  getSchema(): AuthFnSchemaDefinition;
  openApi?(): Record<string, unknown>;
}
```

| Property | Notes |
| --- | --- |
| `router` | Framework-agnostic router. Mount it through one of the `@superfunctions/http-*` adapters. |
| `provider` | Has `authenticate(request) → Promise<AuthFnSession | null>`. Use it inside your own routes/middleware to read the current session. |
| `getSchema()` | Returns the union of every plugin's schema. Used by `@superfunctions/cli generate`. |
| `openApi()` | Returns an OpenAPI 3.1 document for the enabled plugin set. Undefined when `openApi: false`. |

## Bundled plugin factories

```ts
authFnPasswordPlugin(config?: PasswordPluginConfig): AuthFnPlugin;
authFnEmailOtpPlugin(config?: EmailOtpPluginConfig): AuthFnPlugin;
authFnSocialOAuthPlugin(config?: SocialOAuthPluginConfig): AuthFnPlugin;
authFnApiKeyPlugin(config?: ApiKeyPluginConfig): AuthFnPlugin;
authFnTwoFactorPlugin(config?: TwoFactorPluginConfig): AuthFnPlugin;
authFnMultiRegionPlugin(config?: MultiRegionPluginConfig): AuthFnPlugin;
authFnNativeHandoffPlugin(config?: NativeHandoffPluginConfig): AuthFnPlugin;
```

See [Plugins](../plugins) for each plugin's full reference.

## Error classes

Every error the kernel can return has a typed class. Throw them from custom plugins or hooks; the kernel wraps them in [error envelopes](../core-concepts/envelopes).

```ts
import {
  AuthFnError,
  AuthFnConflictError,
  AuthFnConfigError,
  AuthFnValidationError,
  AuthFnInvalidCredentialsError,
  AuthFnUnauthenticatedError,
  AuthFnSessionExpiredError,
  AuthFnSessionRevokedError,
  AuthFnCsrfInvalidError,
  AuthFnNotFoundError,
  AuthFnNotImplementedError,
  AuthFnRateLimitedError,
  AuthFnDeliveryFailedError,
  AuthFnEmailNotVerifiedError,
  AuthFnPluginAbortedError,
  AuthFnInternalError,
  AuthFnOAuthCallbackInvalidError,
  AuthFnOAuthProviderUnsupportedError,
  AuthFnOAuthStateInvalidError,
  AuthFnOAuthStateReplayedError,
  AuthFnOtpInvalidError,
  AuthFnOtpExpiredError,
  AuthFnOtpReplayedError,
  AuthFnRedirectUriDisallowedError,
  AuthFnRegionMismatchError,
  AuthFnRegionNotFoundError,
  AuthFnTwoFactorRequiredError,
  AuthFnTwoFactorInvalidCodeError,
  AuthFnApiKeyRevokedError,
  AuthFnAdminAmbiguousUserError,
  AuthFnAdminConfigError,
  AuthFnAdminUnauthorizedError,
} from '@authfn/core';
```

Every class extends `AuthFnError` and exposes `code`, `status`, `retryable`, `details`. See [Errors](../core-concepts/errors) for the full code → behavior table.

## Type exports

```ts
import type {
  AuthFnConfig,
  AuthFnInstance,
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnSession,
  AuthFnSessionRecord,
  AuthFnUserRecord,
  AuthFnHooks,
  AuthFnHookContext,
  AuthFnRuntimeResolver,
  AuthFnRuntimeResolution,
  AuthFnCookieConfig,
  AuthFnAccountLinkingConfig,
  AuthFnObservabilityConfig,
  AuthFnEvent,
  AuthFnEventType,
  AuthFnDeliveryProvider,
  AuthFnSocialProviderConfig,
  AuthFnSocialProfileResolver,
  AuthFnPasswordCompromiseChecker,
  AuthFnSchemaDefinition,
  AuthFnSuccessEnvelope,
  AuthFnErrorEnvelope,
} from '@authfn/core';
```

## Authentication helper

Inside your own routes (or framework middleware), read the current session via `auth.provider`:

```ts
const session = await auth.provider.authenticate(request);
if (!session) {
  return new Response('unauthorized', { status: 401 });
}
```

`authenticate` returns `null` for an unauthenticated request, an `AuthFnSession` for a cookie- or bearer-authenticated request, or throws an `AuthFnError` for a malformed or revoked credential.

## Hooks API

```ts
createAuthFn({
  // ...
  hooks: {
    beforeUserCreate(ctx, input) { /* ... */ },
    afterUserCreate(ctx, user) { /* ... */ },
    beforeSessionIssue(ctx, input) { /* ... */ },
    afterSessionIssue(ctx, session) { /* ... */ },
    beforeChallengeSend(ctx, input) { /* ... */ },
    afterChallengeSend(ctx, result) { /* ... */ },
    beforeOAuthStart(ctx, input) { /* ... */ },
    afterOAuthCallback(ctx, result) { /* ... */ },
    beforeAccountDelete(ctx, input) { /* ... */ },
    afterAccountDelete(ctx, result) { /* ... */ },
  },
});
```

See [Concepts → Hooks](../core-concepts/hooks).

## Observability

```ts
createAuthFn({
  // ...
  observability: {
    emit(event) {
      myLogger.info(event.type, event);
    },
  },
});
```

See [Concepts → Observability](../core-concepts/observability).

## Versioning

`@authfn/core` follows semver. New plugins or new optional fields on existing types are minor versions. Breaking changes (renaming an envelope field, deleting a route) are major versions, and are accompanied by a migration note in the [changelog](../reference/changelog).

## Related

- [Concepts → Architecture](../core-concepts/architecture) — how the kernel composes its parts.
- [Plugins](../plugins) — bundled plugin reference.
- [Plugins → Authoring](../plugins/authoring) — write your own plugin.
- [Frameworks](../frameworks) — `@superfunctions/http-*` adapters for mounting the router.
