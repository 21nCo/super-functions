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
LangFn trace identifiers use Web Crypto `randomUUID`, with Node crypto as the fallback on Node 18. Neither path uses pseudorandom identifiers. Runtimes with neither implementation fail explicitly.

See [Sonar triage](SONAR.md) for the per-issue evidence, resource-template compatibility checks, and the verified generated-discovery duplication setting.

Model stream lines are limited to 1 MiB. API-tool responses default to an 8 MiB decoded-byte cap; trusted callers of `executeApiCall` or `ToolPolicy` can configure `maxResponseBytes`. Oversized bodies cancel the reader. Git history scans default to a 32 MiB per-commit cap, configurable as `maxCommitBytes`, and fail explicitly above it.

Outlook retains read/profile OAuth consent by default, like Gmail. Write and calendar actions require the host to explicitly configure and obtain their listed grants; merely advertising an action never grants permission or silently broadens consent.

The local platform canary now imports LangFn and creates a mock completion/trace in workerd. Node-only MCP process transport loads only when a stdio command connection starts, keeping the Workers import path usable. This remains local emulation, not live model/provider qualification.

September 14 follow-up verification from review snapshot `cfd1a7a24e142e80b1894d859c2c4be28988b4dc`: 148 LangFn, 476 provider, 42 SecFn server (including five real PostgreSQL contracts), 10 SecFn core, 13 SecFn runtime and 23 shared rate-limit tests passed. Node 18.20.8 ran a mock completion and trace generation without global Web Crypto. The local workerd platform canary and 38-package consumer gate passed; final artifact-set digest: `0a6401bb0a17fc3a000ea72e4e50b389475b8dae78c9d7ca8618c63cd4623b62`. The disposable PostgreSQL container was removed. These checks do not substitute for fresh hosted CI, review, or the user-deferred live provider/model tests.

Review contract clarifications (September 15, 2026): an entirely absent usage report is unknown; a present but incomplete or malformed report is rejected consistently across adapters. A custom OpenAI fetch implementation does not supply credentials. Embeddings share the configured model transport, including rotated secret references, proxy endpoint, timeout, organization and project headers. Mistral uses its native `stream: true` contract; the current [Mistral request schema](https://docs.mistral.ai/api) does not define OpenAI's `stream_options.include_usage`, so that suggested flag was not added. Live Mistral usage qualification remains separate from fixture validation.

September 15 review-batch verification: LangFn 152 distinct tests passed across the full run and focused rerun after replacing implicit test credentials; SecFn server 45 tests passed, including seven PostgreSQL contracts; shared rate-limit 24 tests passed. Final SecFn environment-listing regression and affected typechecks passed. The 38-package gate (including schema metadata agreement and Svelte consumer behavior) and workerd canary passed. Artifact-set SHA-256: `cc5c0f8a84e5a6a664b907b425e17715d5284af78dac73b4a3302cb36c37a777`. Disposable PostgreSQL was removed.

At `f307baba`, audit consistency remained open. The subsequent repair replaces the timestamp cutoff with an explicitly requested repeatable-read transaction; a real PostgreSQL test commits backdated rows between pages and confirms that only the next metrics request sees them. These local checks do not establish merge readiness.

Snapshot/transaction qualification (review input `f307babab4db1a4e74bd173905c347e823f58034`): 165 LangFn tests, 117 database adapter/wrapper tests, and 51 SecFn tests passed, including ten real PostgreSQL contracts. The PostgreSQL pool permits concurrent connections; the audit test commits backdated rows between pages, and conflicting member additions/replacements admit one writer. Namespace-wrapper isolation propagation and duplicate administrator/runtime output rejection were also verified. The 38-package gate and workerd canary passed; artifact-set SHA-256: `f3f67eca7042a998d0373a7fa144c8480ab86537e0c7fd387375147c217434fa`. The disposable PostgreSQL container was removed. Transport clients are no longer stored in a module-global cache, so rotating credentials are not retained in cache keys. Migration rollback cleanup is intentional after an aborted migration transaction.
