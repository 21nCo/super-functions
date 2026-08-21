# `@plugfn/admin`

Function-owned Super Console, REST/OpenAPI, and MCP administration contracts for PlugFn.

The adapter accepts a project-owned public `PlugFn` facade. It does not query PlugFn tables or providers directly, and it requires the application to map the authenticated admin context to a PlugFn user/tenant/organization identity.

Supported administration surfaces are intentionally limited to APIs PlugFn implements today:

- sanitized registered-provider discovery;
- owned connections, OAuth authorization, refresh, and disconnect;
- provider-installation inspection, disable, and revoke;
- workflow inspection, statistics, enable, disable, and delete;
- owned webhook receipts and their delivery attempts; and
- owned sync-job inspection, run, enqueue, and cancel.

Credential export/rotation, OAuth-app CRUD, webhook replay, arbitrary workflow execution/retry, and synthetic usage/failure resources are not advertised because PlugFn has no equivalent public domain API.

```ts
import { plugFn } from "plugfn";
import { createPlugFnDomainAdminAdapter } from "@plugfn/admin";

const plug = plugFn(config);

const admin = createPlugFnDomainAdminAdapter({
  plugfn: plug,
  projectId: "project_1",
  identity: (context) => ({
    userId: context.actor.id,
    tenantId: context.scope.namespace,
  }),
});
```

Every operation requires an active project scope. Destructive disconnect, installation revocation, and workflow deletion operations require high-assurance confirmation and all writes require audit evidence through the shared `@superfunctions/admin` dispatcher.
