# `@superfunctions/admin`

Shared, function-owned administration contracts for Super Console and self-hosted API consumers.

The package keeps one operation definition authoritative across the operator UI, REST/OpenAPI, the TypeScript client, and McpFn. A function exports a capability manifest and binds its domain administration service through `createAdminCapabilityAdapter`. The console explicitly enables modules through `createAdminRegistry`; an empty allowlist produces a shell-only installation, and disabled functions expose no route, OpenAPI operation, navigation entry, or MCP tool.

```ts
import {
  createAdminCapabilityAdapter,
  createAdminDispatcher,
  createAdminOpenApiDocument,
  createAdminRegistry,
  createAdminClient,
  defineAdminCapability,
  MemoryAdminAuditSink,
  MemoryAdminIdempotencyStore,
} from "@superfunctions/admin";

const manifest = defineAdminCapability({
  schemaVersion: "1.0",
  id: "examplefn",
  displayName: "ExampleFn",
  version: "1.0.0",
  description: "Operate ExampleFn.",
  category: "example",
  availability: "optional-product",
  scopeLevels: ["installation", "workspace", "project", "environment"],
  resources: [{
    id: "records",
    label: "Records",
    description: "Example records managed in the active scope.",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status"],
    searchableFields: ["id", "name"],
    sortableFields: ["name"],
    presentation: {
      listOperationId: "examplefn.records.list",
      titleField: "name",
      statusField: "status",
      columns: [
        { field: "name", label: "Name" },
        { field: "status", label: "Status", format: "status" },
      ],
      defaultSort: { field: "name", direction: "asc" },
    },
  }],
  operations: [{
    id: "examplefn.records.list",
    title: "List records",
    description: "List records in the active scope.",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "object" } } },
      required: ["items"],
    },
    route: { method: "GET", path: "/resources/records" },
    permission: "examplefn.records.read",
    safety: { classification: "read", idempotent: true, audit: "optional" },
    target: { resource: "records", collection: true },
    pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 200 },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }],
});

const adapter = createAdminCapabilityAdapter(manifest, {
  "examplefn.records.list": async ({ context }) => ({
    ok: true,
    data: { items: [] },
    meta: { environmentId: context.scope.environmentId },
  }),
});

const registry = createAdminRegistry({
  adapters: [adapter],
  enabledModules: ["examplefn"], // always explicit
});

const dispatcher = createAdminDispatcher({
  registry,
  audit: new MemoryAdminAuditSink(),
  idempotency: new MemoryAdminIdempotencyStore(),
});

const openapi = createAdminOpenApiDocument(registry, {
  securitySchemes: {
    operatorSession: deployment.operatorSessionScheme,
    operatorApiKey: deployment.operatorApiKeyScheme,
  },
  csrfHeader: { name: deployment.operatorCsrfHeaderName },
});

const client = createAdminClient({
  baseUrl: "https://console.example.com/api/admin/v1",
  scope: { installationId: "install_1", workspaceId: "ws_1", projectId: "project_1" },
  timeoutMs: 30_000,
});
const enabled = await client.registry();
const overview = await client.overview();
const search = await client.search("failed deploy", { limit: 25 });
const auditPage = await client.audit({ module: "examplefn", outcome: "failed" });
const settings = await client.settings();
const mcpMetadata = await client.mcp();
const confirmation = await client.issueConfirmation("examplefn.records.delete", { id: "record_1" });
await client.invokeOperation("examplefn.records.delete", { id: "record_1" }, {
  idempotencyKey: crypto.randomUUID(),
  confirmationToken: confirmation.token,
});
```

Function packages wrap the transport client with
`create<Function>AdminClient(...)`. Those clients expose exact operation-ID
methods, live `availability()`, cursor `pages(...)`, and `raw(...)` transport
access alongside their named domain methods. The base client composes a
deterministic timeout with the caller's AbortSignal, applies one immutable typed
scope to every request, and exposes `invokeOperationRaw(...)` when status or
headers must be inspected without normalized HTTP errors. A package with no
canonical domain operator service declares `availability: "unavailable"`, an
`unavailableReason`, and no operations/navigation; registry startup rejects an
attempt to enable it.

`presentation` is optional, non-authoritative metadata for generic operator
pages. Operation references must name reads for the same resource, dotted field
paths are validated against declared output schemas when possible, and default
sort fields must be declared sortable. It never changes authorization, safety,
validation, redaction, audit, or dispatcher behavior.

Generic consoles only render controls declared by `presentation.query`. Each
filter maps a stable console query field to its exact list-operation input path,
such as `status` to `filter.status`. A context-bound collection declares
`standaloneList: false` together with `presentation.parent`; its bindings create
detail-page navigation and supply the child query fields. This keeps nested
operation input and parent/child navigation function-owned and manifest-driven.

Production deployments inject provider-backed actor/context resolution, an
append-only audit sink, durable atomic idempotency storage, confirmation
verification, and function-owned services. `Memory*` implementations are
intended for tests and embedded development only: the memory idempotency store
prevents concurrent execution inside one process but is neither durable nor
multi-process safe. A production store must atomically reserve the full
identity, fence completion and pre-domain release with the claim token, and
define stale-claim recovery. Claims are released only when the domain handler
was never entered; post-domain errors remain fenced because the commit outcome
may be uncertain.

Every audit sink must declare and implement durable first-write-wins semantics
for `AdminAuditEvent.id`. The dispatcher persists one stable terminal event ID
in the pending idempotency record before the first terminal sink write, retries
that same ID after ambiguous sink or reconciliation acknowledgements, and only
then atomically marks the record reconciled. A sink that can append the same ID
twice is not a valid `AdminAuditSink`, and dispatcher startup rejects it.

Required-audit mutations append a sanitized `attempted` event before the
function handler runs, then a terminal outcome. A rejected attempt write fails
before domain mutation. Audit and domain storage are not one transaction, so
production operations must monitor and reconcile attempted events without a
terminal record.

## Safety invariants

- Scope is validated against each resource/operation minimum. A complete chain is required down to that minimum; namespace and region remain subordinate execution attributes.
- Mutations must declare required audit; destructive operations must require confirmation.
- Destructive operations declare an exact `target.resource` and required `target.idInput`; collection actions declare `target.collection` so consoles never render an unbound target mutation.
- `redaction.inputFields` protects audit input and `redaction.outputFields` scrubs validated domain output before the first response or idempotency storage/replay. Common secret-shaped keys are also redacted recursively from every outward domain result, including MCP and replay, even when a manifest omits them.
- Intentional one-time credentials require exact schema-bound `redaction.allowOutputPaths` such as `$.item.token`, closed non-union object schemas, explicit `[*]` array traversal, a string scalar leaf, required audit, recent-auth/MFA/approval confirmation, and `idempotent: false`. The exception applies only to the declared output path; metadata, audit/error details, sibling/nested keys, and unexpected properties remain recursively redacted, and non-idempotency prevents plaintext replay storage.
- Idempotency identities bind key, actor, full tenant scope, and operation. Atomic begin/complete claims prevent concurrent execution; reusing a key with different input is rejected.
- Registry dependency, cycle, operation, route-pattern, and MCP-name collisions fail closed.
- Generic validation/errors/audit records never echo raw secrets; audit input recursively redacts common secret keys.
- Scope is a strict `installation → workspace → project → environment` hierarchy. `organization` is a deprecated installation-root alias. Resources may declare `minimumScope`; operations may keep or deepen that requirement, and legacy operations without either inherit the deepest manifest level.
- Contextual policies can implement `discover` to filter registry, MCP, and confirmation discovery. Dispatch always repeats permission, contextual input, and object-level authorization.
- Idempotent mutation results are durably fenced with a stable terminal audit ID before terminal audit. If terminal audit or reconciliation acknowledgement fails, the same key replays the result, redelivers the same logical event ID to an idempotent sink, and atomically marks it reconciled without another domain invocation. `finalizeAudit` is mandatory for every idempotency store and dispatcher startup rejects stores that cannot persist that transition; later replays emit ordinary `replayed` events.
- `safety.confirmation` describes high-risk assurance (`explicit`, `recent-auth`, `mfa`, or `approval`) while the injected confirmation service owns the enforcement mechanism.
- MCP tools invoke the shared dispatcher and therefore cannot bypass policy, confirmation, idempotency, validation, or audit.

`npm run review:mutation-risk --workspace=@superfunctions/admin` emits a
machine-readable review of every available manifest mutation identified as a
credential lifecycle or external side effect and exits non-zero for missing or
weak confirmation.

McpFn mutation tools add a reserved `_admin` object to their projected input schema. Idempotent writes require `_admin.idempotencyKey`; destructive operations additionally require `_admin.confirmationToken`. The projection strips `_admin` before validating or invoking the function-owned domain handler, so REST/OpenAPI domain schemas remain unchanged and mutation controls cannot be persisted accidentally.
