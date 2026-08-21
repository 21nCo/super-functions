# Super Console server entry

Self-hosted installation modules import the stable server-only entry:

```ts
import { createSuperConsole } from "superconsole/server";
import { installation } from "./deployment.js";

export const superConsole = createSuperConsole({
  adapters: installation.adminAdapters,
  enabledModules: installation.enabledModuleIds,
  auth: installation.operatorAuth,
  shellPolicy: installation.shellPolicy,
  audit: installation.audit,
  auditQuery: installation.auditQuery,
  idempotency: installation.idempotency,
  confirmation: installation.confirmation,
  policy: installation.policy,
  search: installation.search,
  overview: installation.overview,
  settings: installation.settings,
  openApiSecuritySchemes: {
    operatorSession: installation.operatorSessionScheme,
    operatorApiKey: installation.operatorApiKeyScheme,
  },
  openApiCsrfHeader: { name: installation.operatorCsrfHeaderName },
});
```

The registry and every downstream surface are derived from the supplied
manifests. Module IDs are not restricted to a product catalog. Module
ownership, folded children, dependencies, labels, icons, navigation, and
resource presentation are manifest data, and disabled modules are absent from
registry, UI, REST/OpenAPI, client dispatch, and MCP discovery.

Set `SUPERCONSOLE_INSTALLATION` to the absolute filesystem path or `file://`
URL of that compiled module. The loader imports it once and accepts `default`,
`superConsole`, or `createSuperConsoleInstallation`. `[]` is a valid shell-only
selection. Startup rejects missing audit, atomic idempotency, mutation
authorization, or bound confirmation infrastructure required by enabled
operations.

Required-audit flows record a sanitized attempt before invoking mutable state
and a terminal outcome afterward. This is fail-closed preflight, not an atomic
transaction across audit and domain stores; operators must reconcile attempts
without terminal events.

The deployment object above is application-owned composition, not a second
administration implementation: every adapter remains function-owned and every
mutation continues through the shared dispatcher. Provider-specific auth
bridges also remain function-owned; AuthFn installations import
`createAuthFnOperatorAuth` from `@authfn/admin`.
