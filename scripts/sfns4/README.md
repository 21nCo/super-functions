# SFNS-4: Rex upstream compatibility

Issue: https://linear.app/21n/issue/SFNS-4/deliver-super-functions-upstream-capabilities-and-compatibility

Base dev source: `93421d275fe80ee5d1e9417b07f47db95efdce65`. TypeScript LangFn, MemoryFn and SecFn adoption source: next `b21477fc9a32ae425c38a2de810b5a8705fc711f`.

## Scope

This candidate set adds 111 selected integration actions across 13 provider modules, action effect/scope/resource/redaction/retry manifests, shared quota and workflow admission adapters, native Gemini tools/streaming, injected PostgreSQL memory storage and deletion lifecycle, secure CLI credential seams, and connected-account SendFn mail adapters. Rex retains ownership of membership, grants, approvals, durable agent state, automation and billing. Use Cloudflare Workflows/Queues for hosted scheduling, not local timers.

Selected contracts with applied resource manifests are version 1.1.0; declaration-only Google contracts remain 1.0.0. Read each manifest version rather than assuming one catalog-wide version. Resource parameters reference top-level input fields; parameterless hints reference a collection or the trusted connected account/site. Structured values require consumer interpretation. Hints are not authorization or exhaustive provider effect inventories. Changed manifest hashes require consumer re-review.

Persisted account selection applies configured authorization even without an explicit actor, using the supplied trusted userId. Provider-returned scopes are retained on callback and refresh; automatic refresh rechecks authorization before dispatch. Consumers must supply server-derived identities and enforce current tenant, role, provider scope equivalence and resource policy.

MemoryFn now requires explicit tenant/tag scope. PostgreSQL clients may be injected and remain caller-owned; the URL factory owns its client and must be closed. Apply the additive migrations in memoryfn/typescript/migrations. SQLite requires an explicit adapter. Revisions protect updates; forgetting scrubs and tombstones memories and deletes relationships. Rex must still filter derived retrieval against its authoritative DataFn records. See the MemoryFn README for lifecycle and migration details.

Shared rate limiting requires a linearizable AtomicKVStoreAdapter. The execution coordinator blocks concurrent and uncertain claims. Expiry does not authorize replay of an external write: stop the old worker, reconcile effects, then reconcile the exact claim token. Defaults remain local for compatibility. CliFn credentials require an explicit product namespace or injected keychain adapter; unsafe writes do not automatically retry.

## Reproduce local qualification

Use Node 22 and install the root workspace dependencies. Native SQLite consumers need a working better-sqlite3 build.

```sh
npm --prefix plugfn/core test
npm --prefix plugfn/providers test
npm --prefix plugfn/core run type-check
npm --prefix plugfn/providers run typecheck
npm run gate:langfn-release
node scripts/sfns4/packed-consumers.mjs
node scripts/sfns4/catalog.mjs
node scripts/sfns4/worker-canary.mjs
node scripts/sfns4/worker-platform-canary.mjs
```

The packed consumer script prints the immutable artifact-set hash and preserves 38 tarballs under a hash-addressed local .conduct/SFNS-4/artifacts directory. Catalog generation writes action manifests locally. These outputs are deliberately excluded from the dev PR. Current versions are unpublished candidates: do not assume registry packages with the same version contain this implementation. Coordinate new versions and dependency pins before tagging/publishing. A branch name is not an immutable dependency.

## Recorded validation and limits

- Latest PlugFn/provider runs: 227 core tests and 468 provider tests (695 total), including 223 catalog/resource/shared-lifecycle tests covering all 111 actions. Both typechecks pass.
- Shared lifecycle tests exercise real connection storage, encrypted token vault, OAuth handling, authenticated HTTP and execution. Provider HTTP responses and action payload handlers are test doubles. Provider-specific wire fixtures remain separate; this is not full live provider certification.
- Earlier affected suites: MemoryFn 23 tests including real pgvector PostgreSQL 16, SecFn server 13 tests; regression tests cover permission expiry, content-only memory updates, dot-segment rejection and Retry-After propagation.
- Packed installation and Svelte SSR/hydration pass for 38 packages. Local Workers canaries cover Hono/SecFn/MemoryFn and two-isolate quota/workflow coordination. Earlier MCP qualification covered 82 gate steps; source Svelte coverage included 69 trees.
- Earlier hosted Railway PostgreSQL 17.11/pgvector 0.8.6 through Cloudflare Hyperdrive passed eight consecutive synthetic lifecycle runs after one initial SQLSTATE 58000 reconnect failure. Its cause was not established. That deployment preceded the later fixes and does not qualify the final PR head. Owned test infrastructure was removed.
- Live provider and Gemini qualification is deferred to the user. Provider-specific payload/pagination completeness, provider OAuth approvals, real refresh/revocation and sandbox effect counts remain separately tracked. Do not claim public production readiness from these fixtures.

See HOSTED.md for reproducible disposable Hyperdrive qualification. Never commit tokens or origin credentials. No registry publication or deployment is performed by opening this PR.

### OAuth scope selection and review fixes

Gmail and Outlook keep read-only default consent. Before requesting write actions, consumers must pass the union of their selected action manifests' `requiredScopes` to `plug.connections.getAuthUrl({ ...options, scopes })`. Outlook calendar capabilities likewise require explicit calendar scopes. Reconnect existing accounts when expanding permissions; executor scope checks reject missing grants before making provider requests. A default read-only connection is not a grant for every catalog action.

SecFn revocation reserves a secret's key. Delete the revoked secret before recreating that key; deletion removes version history and secret-set memberships. A failed cleanup keeps the record revoked and may be retried. Runtime secret sets reject members outside the token's tenant, namespace or environment.

Secret sets default to the development environment, matching direct runtime reads. Mixed-environment sets fail closed if any member falls outside the requested or token environment; create separate sets for each environment. Token scope IDs are resolved at issuance and runtime verification. Both direct reads and secret sets compare canonical namespace slugs rather than display labels, including requests that supply only namespace/environment IDs.


### Contract remediation

Jira site-specific actions accept an optional `cloudId` obtained from `sites.list`.
When supplied, each action validates the selected site and required scopes against
Atlassian accessible resources using the connected credential before dispatch.
The routing field is not sent in the action payload. Existing trusted
`connectionMetadata.cloudId` integrations remain supported.

SecFn secret-set creation and deletion require transactional storage. Set rows
and memberships commit together; failed writes can be retried. Apply the packaged
schema-3 migration with the deployment schema on PostgreSQL `search_path`; it
adds nullable `tenant_id` before rebuilding its index. Legacy scan rows stay
unowned. Admin authorization receives the host's resolved namespace before
execution, without mutating a shared context object.

Run disposable PostgreSQL regression tests with `SECFN_TEST_DATABASE_URL` and
`npm --prefix secfn/server test`. The suite creates and removes its own unique
schema and verifies insertion/deletion rollback and schema-2 upgrades.

Streaming usage now reaches the common budget check for OpenAI, Anthropic,
Ollama, Mistral and custom completion fallbacks. Google already emits usage.
The check rejects reported over-budget usage before successful completion; it
cannot undo provider charges or guarantee a spending cap before usage arrives.
When a budget is configured, missing pricing, missing usage and invalid costs
fail closed. Without a budget, unpriced models report no cost estimate.

The packed UI probe is an internal function invoked with the consumer directory
created by the package gate; it no longer accepts an arbitrary CLI destination.
All probe files use exclusive creation. Run its filesystem regression checks from
the repository root with `node --test scripts/sfns4/packed-ui.test.mjs`.
LangFn trace identifiers require Web Crypto `randomUUID`; runtimes without it
fail explicitly instead of using pseudorandom fallback identifiers.

See [Sonar triage](SONAR.md) for the per-issue evidence, resource-template compatibility checks, and the pending generated-discovery duplication setting.
