# Super Console

Super Console is a self-hosted, manifest-driven operator administration shell.
It has no built-in catalog of product functions: the adapters supplied by an
installation define the available module IDs, resources, operations,
navigation, ownership, dependencies, safety policy, redaction, REST/OpenAPI,
the TypeScript client, and McpFn tools.

## Installation module

Create a deployment module and compile it as part of your server application:

```ts
import {
  createSuperConsole,
  type SuperConsolePrincipal,
} from "superconsole/server";
import { adminAdapters, services } from "./superfunctions.js";

export const superConsole = createSuperConsole({
  adapters: adminAdapters,
  // IDs are arbitrary manifest IDs. An empty list is a valid shell-only install.
  enabledModules: ["identity", "deployments", "internal-tools"],
  auth: services.operatorAuth,
  shellPolicy: services.shellPolicy,
  policy: services.adminPolicy,
  audit: services.auditSink,
  auditQuery: services.auditQuery,
  idempotency: services.durableIdempotency,
  confirmation: services.boundConfirmations,
  search: services.search,
  overview: services.overview,
  settings: services.settings,
  openApiSecuritySchemes: {
    operatorSession: services.operatorSessionScheme,
    operatorApiKey: services.operatorApiKeyScheme,
  },
  openApiCsrfHeader: { name: services.operatorCsrfHeaderName },
});
```

Every enabled module must have a registered adapter. Dependencies, folded
children, owner mounts, display labels, icons, navigation, and resource views
come from those adapters' manifests. Super Console does not infer a function
from its name or require a repository-wide package catalog.

Startup fails closed when enabled operations require infrastructure that was
not injected: a required audit sink, atomic idempotency store, mutation
authorization, or a bound staged confirmation
issuer/activator/revoker/verifier. Required-audit mutations and confirmation
issuance append a sanitized `attempted` event before invoking mutable state,
then append a terminal outcome. Audit and domain state remain separate systems,
so deployments must monitor and reconcile attempts without terminal events.

Confirmation services must return an unusable staged token from `issue`.
Super Console writes the succeeded audit while the token is still staged, then
activates it. Activation failures are recorded as denied events and trigger an
idempotent `revoke`; audit failures therefore cannot leave a live unaudited token.

Set `SUPERCONSOLE_INSTALLATION` to the absolute filesystem path or `file://`
URL of the compiled module. The loader accepts `superConsole`, `default`, or an
async `createSuperConsoleInstallation` export and loads it once per process.

```sh
SUPERCONSOLE_INSTALLATION=file:///srv/app/dist/super-console-installation.js \
  node build
```

The stable server-only package entry is `superconsole/server`; browser code
must not import it.

### Representative `dev` composition

[`examples/dev-installation.ts`](./examples/dev-installation.ts) is the
checked `dev` allowlist. It registers the function-owned ApiFn, AuthFn, BillFn,
BotFn, CliFn, DataFn, ExtFn, FileFn, HostFn, PlugFn, and SearchFn adapters, but
enables only the nine adapters backed by safe server-side domain services.
CliFn and ExtFn remain registered with `availability: "unavailable"` so the
reason is explicit; neither can be enabled until it gains an operator-domain
service that does not expose local shell, credentials, signing, or publishing
capabilities.

The example accepts real adapter instances and deployment-owned auth, policy,
audit, idempotency, confirmation, and OpenAPI infrastructure. It intentionally
does not construct test stores or substitute transport handlers in production.

## AuthFn integration

Core accepts the provider-neutral `SuperConsoleOperatorAuth` contract. AuthFn's
adapter lives with AuthFn so its plugins, hooks, rate limits, two-factor flow,
CSRF, cookie names, and error semantics remain function-owned:

```ts
import { createAuthFnOperatorAuth } from "@authfn/admin";
import { createSuperConsole, type SuperConsolePrincipal } from "superconsole/server";

const auth = createAuthFnOperatorAuth({
  config: authFnConfig,
  resolveOperator: async ({ session }): Promise<SuperConsolePrincipal | null> =>
    operators.resolve(session.actorId),
  authorizeScope: ({ principal, requested }) =>
    operators.authorizeScope(principal, requested),
});

export const superConsole = createSuperConsole({ ...installation, auth });
```

Other identity providers implement the same small operator-auth contract and
may project their own CSRF cookie/header names and OpenAPI schemes.

## Generic resource presentation

Resources may add optional `presentation` metadata to select non-conventional
list/detail operation IDs, title/subtitle/status fields, columns, formats, and
a default sort. The generic module and resource routes consume this metadata.
If it is absent, the shell retains schema-based inference. Presentation never
bypasses operation permissions, scope checks, confirmations, audit, redaction,
or dispatcher validation.

Function-specific workflows should first be modeled as manifest resources and
operations. A self-hosted application may layer additional build-time routes
around Super Console, but the core package does not load remote UI code or
contain named product routes.

## Administration surfaces

- `/api/admin/v1/registry` discovers enabled manifests and authorized shell surfaces.
- `/api/admin/v1/openapi.json` exposes OpenAPI 3.1 after shell authorization.
- `/api/admin/v1/modules/:moduleId/**` dispatches any enabled module ID.
- `/api/admin/v1/confirmations` issues actor/scope/operation/input-bound tokens.
- `/api/admin/v1/mcp/transport` is the authenticated McpFn streamable-HTTP endpoint.
- `/api/admin/v1/auth/sign-in`, `/auth/2fa`, and `/auth/sign-out` delegate to the configured operator-auth provider.

Automation consumers can use `@superfunctions/admin`'s `createAdminClient` for
registry, overview, search, audit, settings, MCP metadata, confirmation
issuance, route invocation, and operation-ID invocation. McpFn mutations carry
reserved controls under `_admin`; those fields are stripped before domain
validation and never enter function storage.

HTTP requests are recorded with `source: "rest"`; callers cannot override
audit provenance with a request header. McpFn invocations are recorded as
`source: "mcp"`, while direct in-process SDK dispatchers set their own trusted
source in `AdminOperationContext`.

UIFn powers the shell's shared visual system. Function packages own their
adapters and optional integrations; Super Console does not replace them with
local substitutes.

## Deployment and rollback

Treat Super Console as an operator surface over function-owned domain APIs, not
as a replacement for them. Compose the representative dev installation from
real, scope-isolated adapters; keep CliFn and ExtFn registered but disabled;
and inject deployment-owned authentication, mutation authorization, durable
audit, atomic idempotency, confirmation, and OpenAPI security infrastructure.
The in-memory implementations are development and test helpers only.

Roll out in dependency order: the required UIFn and McpFn packages,
`@superfunctions/admin`, changed function-domain packages, function admin
adapters, then `superconsole` and the deployment-owned installation. Keep
`@modelcontextprotocol/sdk` pinned to `1.25.2` until a separately tested
protocol upgrade proves the streamable-HTTP suite. PlugFn schema version 7 adds
the nullable, first-class `tenant_id` workflow owner field. Apply that schema
change before enabling workflow administration, and backfill existing workflow
owners only from an authoritative tenant source; generic workflow metadata is
not an ownership source.

To roll back, first remove traffic and `SUPERCONSOLE_INSTALLATION`, then restore
the previous Super Console deployment while retaining AuthFn's legacy admin
router where it was already used. Roll packages back in reverse dependency
order, revoke console-specific operator credentials when policy requires it,
and reconcile audit attempts without terminal outcomes. Verify that console
and MCP routes no longer accept traffic, existing product APIs still pass their
focused checks, CliFn and ExtFn remain unreachable, and retained audit data is
still readable.
