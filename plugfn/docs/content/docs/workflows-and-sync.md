---
title: Workflows and sync
description: Run provider actions and persisted integration jobs.
---

# Workflows and sync

PlugFn coordinates provider actions, workflows, sync jobs, checkpoints, events, and metrics. The TypeScript router includes workflow discovery, sync-job create/list/get/cancel, checkpoint upsert, event list, and metrics routes. Keep workflow execution server-side and authorize it against the derived principal.

The release contract describes DB-backed idempotent workflow resume. Process-local delay timers are not considered production-safe; delay steps fail closed until a durable scheduler exists. Read the [release gates](/docs/reference/release-gates) and [provider throttle runbook](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/provider-throttle-incident.md).

## Execute an action on the server

Use the `plug` instance from [setup](/docs/getting-started). Derive the actor from the host's verified session and select a connection owned by that actor:

```ts
import type { PlugFn, PlugFnActor } from "plugfn";

export async function listRepositories(plug: PlugFn, actor: PlugFnActor, connectionId: string) {
  return plug.action("github", "repos.list", {
    userId: actor.userId,
    actor,
    connectionId,
    params: { visibility: "all", startPage: 1, maxPages: 1 },
    cache: false,
  });
}
```

The result is the action's data (an array for `repos.list`), not an HTTP envelope. A missing provider/action, invalid parameters, unavailable connection, or provider failure rejects the promise. Use the provider's parameter schema and connection scopes; do not forward arbitrary browser action names or credentials into this helper. Retry only operations whose semantics are safe to repeat.

## Queue and inspect a sync job

Register `gmailProvider` from `@plugfn/providers` on the server, configure its OAuth application, and connect Gmail with the scopes required by `mail.sync`. The browser client can then request an authorized sync job; the server worker performs it:

```ts
import { createPlugFnClient } from "@plugfn/client";
const client = createPlugFnClient({ baseUrl: "/api/plugfn", credentials: "include" });
const connections = await client.listConnections({ provider: "gmail" });
const connection = connections.find((item) => item.status === "active");
if (!connection) throw new Error("Connect Gmail first");
const job = await client.createSyncJob({
  provider: "gmail", connectionId: connection.id, resource: "messages", mode: "full",
});
console.log(job.id, job.status);
const current = await client.getSyncJob(job.id);
console.log(current.fetchedCount, current.persistedCount, current.error);
// Optional user cancellation: await client.cancelSyncJob(job.id);
```

Resource identifiers are provider-defined; confirm them in that provider's sync definition. A queued job does not run itself. In an authorized server worker, call `await plug.sync.processQueued({ limit: 10 })` on the application's schedule. Register a persistence sink before expecting fetched records to reach your application's database, and inspect `persistedCount` separately from `fetchedCount`. The browser client manages jobs and checkpoints; it does not execute arbitrary provider actions.

## Persisted workflows

The high-level facade exposes listing, enable/disable/delete, statistics, and trigger rehydration for stored workflows. It does not expose a `plug.workflows.create()` or browser workflow execution method. Hosts can author stored definitions through `AdapterWorkflowStorage`, register serializable action names through `workflows.runtime`, and activate them with `plug.workflows.enable(id)`.

```ts
import { AdapterWorkflowStorage, WorkflowStatus, type PlugFn, type PlugFnActor } from "plugfn";
import type { Adapter } from "@superfunctions/db";

export async function createWorkflow(database: Adapter, plug: PlugFn, actor: PlugFnActor) {
  const storage = new AdapterWorkflowStorage(database);
  const workflow = await storage.create({
    userId: actor.userId, tenantId: actor.tenantId,
    name: "Handle a push",
    status: WorkflowStatus.Disabled,
    definition: {
      trigger: { provider: "github", event: "push" },
      steps: [{ type: "action", id: "record-push", action: "recordPush" }],
    },
  });
  await plug.workflows.enable(workflow.id);
  return workflow.id;
}
```

The setup factory registers `recordPush` to return the trigger event name; the workflow engine records that result. Replace it with your authorized application operation when needed. Keep implementations in trusted server code and references in the stored definition. The host must authorize workflow authoring; direct storage access is not an HTTP authorization boundary. Trigger activation also requires the provider's verified webhook setup. Test duplicate delivery and restart behavior before production adoption. Delay steps currently fail closed without durable scheduling.
