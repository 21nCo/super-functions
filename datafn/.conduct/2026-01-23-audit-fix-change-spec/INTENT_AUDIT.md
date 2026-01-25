## datafn — Intent Audit (audit findings → spec coverage)

This document is the completeness checklist required by [spec.txt](https://www.fetch.at/spec.txt).

### Authoritative inputs used

- Audit findings: `datafn/.conduct/audit-2026-01-23.md`
- Original intent/spec: `datafn/.conduct/spec.md`, `datafn/.conduct/datafn.intent.md`, `datafn/.conduct/dfql.intent.md`
- This change spec folder: `datafn/.conduct/2026-01-23-audit-fix-change-spec/`

---

## Intent Inventory (exhaustive)

1) Server request-level failures MUST be represented as top-level `DatafnEnvelope` `{ ok:false, error }` for every endpoint (no nested `{ ok:false }` result payloads).
2) Invalid JSON bodies for any `POST /datafn/*` endpoint MUST produce deterministic `DFQL_INVALID` with message `"Invalid JSON"` and `details.path:"$"`.
3) Server request validation failures (missing required fields, unknown resource, invalid shapes) MUST be deterministic and top-level `ok:false`.
4) Server MUST require DB configuration for all non-status endpoints (“validation-only mode” is removed); missing DB MUST produce deterministic `INTERNAL "Internal error" path:"$"`.
5) `/datafn/status` MUST advertise canonical capabilities using `sync.*` strings (not `dfql.sync/dfql.seed`) and ordering must be deterministic.
6) `/datafn/status` MUST return deterministic `INTERNAL` when DB health is false.
7) Server authorization MUST receive parsed JSON payload for POST endpoints (and `null` for `GET /datafn/status`) and denial MUST return deterministic `FORBIDDEN`.
8) Server plugin hook execution MUST enforce `runsOn` and deterministic registration-order execution.
9) Server `afterQuery` MUST run for DB-backed query execution; `after*` failures are fail-open.
10) Server internal tables for meta/changes/idempotency/seed MUST use canonical `__datafn_*` model names and semantics.
11) Server MUST assign a monotonic `serverSeq` per namespace using an atomic increment mechanism.
12) Server MUST persist sync change tracking and derive clone/pull cursors from the latest `serverSeq` per table.
13) Server MUST persist idempotency for `(namespace, clientId, mutationId)` in canonical tables so dedupe survives restart (adapter state preserved).
14) `/datafn/seed` MUST be idempotent per namespace and recorded durably.
15) `/datafn/push` MUST reject when `request.clientId` conflicts with an item mutation’s `clientId` (when present).
16) REST wrappers MUST inject schema `version` (not hard-coded).
17) REST mutation wrappers MUST require deterministic `clientId` and `mutationId` and MUST NOT generate mutation ids from clocks/randomness.
18) REST GET wrapper MUST parse `q` as JSON and reject invalid `q` with deterministic `DFQL_INVALID "Invalid JSON" path:"q"`.
19) REST POST wrapper MUST default operation to `merge` when not specified; explicit `insert` on existing id yields deterministic conflict (result-level).
20) Client MUST support plugin hooks with `runsOn` enforcement and fail-open/closed semantics.
21) Core event types and client subscription filters MUST support `action`, `fields`, and `contextKeys`.
22) Client mutation events MUST include deterministic `action/fields` metadata (when knowable) and MUST emit `mutation_rejected` for thrown remote errors (transport errors).
23) Client signal caching MUST use canonical `@datafn/core.dfqlKey` (no duplicated implementation).
24) Repo MUST ship real storage adapters: deterministic in-memory adapter and IndexedDB adapter.
25) Shipped storage adapters MUST implement deterministic ordering and changelog dedupe by `(clientId, mutationId)`.
26) Client offline query for `ready` tables MUST execute locally without remote calls and MUST preserve DFQL semantics deterministically (not a minimal subset).
27) Client offline mutation MUST only fallback on transport unavailability; MUST append to changelog before optimistic apply; optimistic apply MUST be deterministic.
28) Extension RPC transport MUST support canonical request/response envelopes and deterministic subscription event forwarding (subscribe/unsubscribe + events).
29) CLI tooling MUST handle schema validation envelopes correctly and reject invalid schemas deterministically (no incidental runtime errors).
30) Python server SDK MUST provide real `/datafn/*` routes and MUST match TS server envelope semantics and key invariants (invalid JSON, idempotency) deterministically.
31) Package READMEs MUST match implemented APIs and canonical usage patterns (Svelte example, client remote config, core validateSchema behavior, server adapter/capabilities).

---

## Coverage mapping (inventory → SPEC/REQUIREMENTS/TEST_VECTORS)

### 1) Server request-level failures are top-level ok:false envelopes

- **SPEC.md coverage**: `Data formats / protocol → HTTP transport envelope`, `Semantics → Server: envelope semantics`
- **Requirements**: SERVER-ENV-001
- **Test vectors**: TV-SERVER-ENV-OK-001, TV-SERVER-ENV-001

### 2) Invalid JSON is DFQL_INVALID "Invalid JSON" path:"$"

- **SPEC.md coverage**: `Data formats / protocol → Deterministic error messages (request-level)`
- **Requirements**: SERVER-ENV-002
- **Test vectors**: TV-SERVER-ENV-002-POS, TV-SERVER-ENV-001

### 3) Deterministic request validation failures

- **SPEC.md coverage**: `Semantics → Server: envelope semantics`
- **Requirements**: SERVER-ENV-003
- **Test vectors**: TV-SERVER-VALID-001, TV-SERVER-VALID-002

### 4) DB required; missing DB is INTERNAL "Internal error" path:"$"

- **SPEC.md coverage**: `Semantics → Server: DB requirement`
- **Requirements**: SERVER-DB-001
- **Test vectors**: TV-DB-INIT-001, TV-DB-MISSING-001

### 5) Status capability strings are canonical sync.*

- **SPEC.md coverage**: `Data formats / protocol → /datafn/status result shape`, `Semantics → Server: status capabilities`
- **Requirements**: SERVER-STATUS-001
- **Test vectors**: TV-STATUS-001, TV-STATUS-002

### 6) Status returns INTERNAL when DB unhealthy

- **SPEC.md coverage**: `Data formats / protocol → /datafn/status result shape`
- **Requirements**: SERVER-STATUS-001
- **Test vectors**: TV-STATUS-002, TV-STATUS-001

### 7) Authorization sees parsed payload; denial is FORBIDDEN

- **SPEC.md coverage**: `Semantics → Server: authorization ordering`
- **Requirements**: SERVER-AUTH-001
- **Test vectors**: TV-AUTH-001, TV-AUTH-002

### 8) Server plugins enforce runsOn + deterministic ordering

- **SPEC.md coverage**: `Semantics → Server: plugin ordering and environments`
- **Requirements**: SERVER-PLUG-001
- **Test vectors**: TV-PLUG-SERVER-ORDER-001, TV-PLUG-SERVER-RUNSON-001

### 9) Server afterQuery runs for DB-backed path; fail-open

- **SPEC.md coverage**: `Semantics → Server: plugin ordering and environments`
- **Requirements**: SERVER-PLUG-002
- **Test vectors**: TV-PLUG-SERVER-AFTERQUERY-001, TV-PLUG-SERVER-AFTERQUERY-002

### 10) Canonical internal tables `__datafn_*`

- **SPEC.md coverage**: `Data formats / protocol → Server internal tables (normative)`
- **Requirements**: SERVER-CHANGES-001, SERVER-IDEMP-001, SERVER-SEED-001
- **Test vectors**: TV-IDEMP-001, TV-SEED-001

### 11) Atomic monotonic serverSeq per namespace

- **SPEC.md coverage**: `Invariants → Monotonicity`
- **Requirements**: SERVER-SEQ-001
- **Test vectors**: TV-SERVERSEQ-001, TV-SERVERSEQ-002

### 12) Change tracking and cursor derivation from serverSeq

- **SPEC.md coverage**: `Invariants → Monotonicity`
- **Requirements**: SERVER-CHANGES-001
- **Test vectors**: TV-SYNC-CLONE-001, TV-SYNC-CLONE-002

### 13) Durable idempotency by (namespace, clientId, mutationId)

- **SPEC.md coverage**: `Invariants → Idempotency`
- **Requirements**: SERVER-IDEMP-001
- **Test vectors**: TV-IDEMP-001, TV-IDEMP-002

### 14) Seed is idempotent and recorded

- **SPEC.md coverage**: `Data formats / protocol → Server internal tables (normative)`
- **Requirements**: SERVER-SEED-001
- **Test vectors**: TV-SEED-001, TV-SEED-002

### 15) Push clientId consistency

- **SPEC.md coverage**: `Data formats / protocol (implicit in sync payload determinism)`, `Invariants → Idempotency`
- **Requirements**: SERVER-SYNC-CLIENTID-001
- **Test vectors**: TV-PUSH-CLIENTID-001, TV-PUSH-CLIENTID-002

### 16) REST injects schema version

- **SPEC.md coverage**: `Data formats / protocol → REST wrapper conventions (normative)`
- **Requirements**: REST-001
- **Test vectors**: TV-REST-VERSION-001, TV-REST-VERSION-002

### 17) REST requires deterministic clientId/mutationId (no clock/random)

- **SPEC.md coverage**: `Data formats / protocol → REST wrapper conventions (normative)`
- **Requirements**: REST-002
- **Test vectors**: TV-REST-META-001, TV-REST-META-002

### 18) REST GET parses q and rejects invalid q deterministically

- **SPEC.md coverage**: `Data formats / protocol → REST wrapper conventions (normative)`
- **Requirements**: REST-003
- **Test vectors**: TV-REST-QUERY-001, TV-REST-QUERY-002

### 19) REST POST defaults to merge; explicit insert on existing id conflicts

- **SPEC.md coverage**: `Data formats / protocol → REST wrapper conventions (normative)`
- **Requirements**: REST-004
- **Test vectors**: TV-REST-POST-DEFAULT-001, TV-REST-POST-DEFAULT-002

### 20) Client plugins exist and enforce runsOn + fail-open/closed

- **SPEC.md coverage**: `Semantics → Client: plugin ordering and environments`
- **Requirements**: CLIENT-PLUG-001
- **Test vectors**: TV-PLUG-CLIENT-001, TV-PLUG-CLIENT-002

### 21) action/fields/contextKeys are supported in events + filters

- **SPEC.md coverage**: `Public API → @datafn/core → Events and filters (extended)`
- **Requirements**: CORE-EVENT-001, CLIENT-FILTER-001
- **Test vectors**: TV-CORE-EVENT-001, TV-CORE-EVENT-002, TV-CLIENT-FILTER-001, TV-CLIENT-FILTER-002

### 22) Client mutation events include action/fields and emit mutation_rejected on thrown errors

- **SPEC.md coverage**: `Semantics → Client: events`, `Semantics → Client: offline fallback classification`
- **Requirements**: CLIENT-EVENT-001
- **Test vectors**: TV-CLIENT-EVENT-001, TV-CLIENT-EVENT-002

### 23) Signals use canonical core dfqlKey

- **SPEC.md coverage**: `Semantics → Client: signals`
- **Requirements**: CLIENT-SIGNAL-001
- **Test vectors**: TV-CLIENT-SIGNAL-001, TV-CLIENT-SIGNAL-002

### 24) Ship memory + IndexedDB storage adapters

- **SPEC.md coverage**: `Semantics → Storage adapters`
- **Requirements**: STORAGE-MEM-001, STORAGE-IDB-001
- **Test vectors**: TV-STORAGE-MEM-001, TV-STORAGE-IDB-001

### 25) Shipped adapters implement deterministic ordering + changelog dedupe

- **SPEC.md coverage**: `Semantics → Storage adapters`
- **Requirements**: STORAGE-MEM-001, STORAGE-IDB-001, CLIENT-CHANGELOG-001
- **Test vectors**: TV-STORAGE-MEM-001, TV-CHANGELOG-001, TV-CHANGELOG-002

### 26) Offline query executes locally for ready tables and preserves DFQL semantics

- **SPEC.md coverage**: `Client runtime specification (implicit via Semantics → Storage adapters + Invariants)`
- **Requirements**: CLIENT-OFFLINE-QUERY-001
- **Test vectors**: TV-OFFLINE-QUERY-001, TV-OFFLINE-QUERY-002

### 27) Offline mutation only on transport errors; append before apply; deterministic

- **SPEC.md coverage**: `Semantics → Client: offline fallback classification`
- **Requirements**: CLIENT-OFFLINE-MUT-001, CLIENT-CHANGELOG-001
- **Test vectors**: TV-OFFLINE-MUT-001, TV-OFFLINE-MUT-002, TV-CHANGELOG-001

### 28) Extension RPC supports canonical envelopes and subscription events

- **SPEC.md coverage**: `Data formats / protocol → Extension RPC envelope`
- **Requirements**: EXT-001
- **Test vectors**: TV-EXT-001, TV-EXT-002

### 29) CLI rejects invalid schemas deterministically

- **SPEC.md coverage**: `Semantics → Tooling: deterministic schema validation`
- **Requirements**: CLI-VALIDATE-001, CLI-CODEGEN-001, CLI-MIG-001, CORE-UTIL-001
- **Test vectors**: TV-CLI-VALIDATE-001, TV-CLI-VALIDATE-002, TV-CODEGEN-002, TV-MIG-002

### 30) Python SDK parity for routes + envelopes + invariants

- **SPEC.md coverage**: `Public API → Python package datafn (server-only)`, `Semantics → Tooling: deterministic schema validation`
- **Requirements**: PY-SDK-001, PY-SDK-002
- **Test vectors**: TV-PY-001, TV-PY-002, TV-PY-PARITY-001, TV-PY-PARITY-002

### 31) Documentation matches implemented APIs and canonical examples

- **SPEC.md coverage**: `Semantics → Documentation parity`
- **Requirements**: DOCS-SVELTE-001, DOCS-CLIENT-001, DOCS-CORE-001, DOCS-SERVER-001
- **Test vectors**: TV-DOCS-SVELTE-001, TV-DOCS-CLIENT-001, TV-DOCS-CORE-001, TV-DOCS-SERVER-001 (and paired “must not” vectors)

---

## Final completeness statement

**No missing intent items.**

