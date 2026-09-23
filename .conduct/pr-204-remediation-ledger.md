# PR #204 remediation ledger

This is the persistent convergence ledger for
`21nCo/super-functions#204`. Review thread state is authoritative only for the
snapshot SHA recorded by a round; open-thread counts are not convergence proof.

## Hosted workflow pin

- Skill: `21n/pr-refetch-fix@1.3.0`
- Revision: `5`
- Skill ID: `skill:3ba0f6dd-212c-4933-9feb-cf87481a0466`
- Version ID: `skill-version:a0cb9070-f6e5-408f-9d1e-889962922ba2`
- Digest: `sha256:6ea2fcc8c00d256b7edf6c3afd43e667ffe20f2459404ac408e7172b31d5f4a9`

## Pull request identity

- URL: https://github.com/21nCo/super-functions/pull/204
- Base: `dev`
- Head branch: `aravink/mcp-4-make-mcpfn-cloudflare-worker-bundles-resilient-to-mixed-zod`
- Current assessed head: `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f`

## Defect families

| Family ID | Failed rounds | Current state | Last attempted head | Behavioral evidence |
| --- | ---: | --- | --- | --- |
| `schema-engine-parity` | 6 | Architecture reset expanded to preserve relative-resource bases and reject legacy `id` consistently; repair verified locally | `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f` | Old head changed anonymous relative-reference bases and let the fallback accept legacy `id`; both engines now pass compiler, collection, collision, empty-reference, and real-workerd coverage. |
| `manifest-resource-graph` | 2 | Superseded by the coordinated `schema-engine-parity` repair | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | Forward, local, cyclic, sorted-manifest, independent-root, and synthetic-ID collision cases pass in the release gate. |
| `gate-diagnostic-stability` | 0 | Fixed locally | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | The Worker records module-startup rejection details and the host-side diagnostics assertion distinguishes acceptance from an unexpected rejection reason. |
| `worker-bundle-runtime` | 0 | Fixed | `f6f6fe8ebd59858dd3cdbcffa36e392ef857c103` | Mixed root `zod` plus inlined MCP SDK starts under workerd and completes an authenticated MCP tool call. |
| `runtime-configuration` | 0 | Fixed | `d33a8c519667ce91d08f8ab8a6410587a303d169` | Worker compatibility flags and edge-safe validator selection are exercised by the real workerd gate. |
| `dependency-policy` | 0 | Invalid finding | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | `zod` is intentionally a build-time dependency for bundle inlining; it is not required at consumer runtime. |
| `regex-test-interpretation` | 0 | Invalid finding | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | The cited third argument was test metadata rather than a validator option; the malformed-pattern assertion passes. |

## Architecture reset: `schema-engine-parity`

- Shared invariant: every `$ref` accepted during schema registration or manifest
  validation resolves inside that compiler or collection before startup can
  succeed. Both engines preserve the same draft-07 resource and base semantics
  for absolute, local, empty, and relative references; reject legacy `id`
  consistently; and retain an independent local-fragment root for every
  anonymous document.
- Faithful old-head reproduction: on
  `9728d2b39f5a512ab55cd3b2a918686ae83ededa`, both
  `createSchemaCompiler("cfworker").compile({ $ref: missing })` and
  `validateSchemaCollection(..., "cfworker")` returned successfully; the
  unresolved reference threw only on later data validation. On
  `6ae4a32b9604065dcbcad688aeef7b74aab8dfea`, a valid local `$ref` beneath a
  dependency named `type` compiled but threw during fallback data validation,
  while an empty current-resource `$ref` was rejected during fallback
  compilation; Ajv accepted and validated both. On
  `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f`, Ajv compiled a registered
  `$id: "shared"` followed by an anonymous `$ref: "shared"`, while the fallback
  rejected it after resolving the reference under the synthetic anonymous
  root; both collection paths rejected the same valid graph. Ajv rejected a
  nested legacy `id` beside `$ref: ""`, while the fallback accepted it.
- Coordinated plan: preserve the original relative-resource namespace before
  assigning collision-safe synthetic roots, select an internal base whose
  origin is absent from every input identifier and reference, normalize both
  identifiers and references into that namespace, and apply a shared recursive
  legacy-`id` guard to compiler and collection paths. Keep the draft-07
  dependency traversal, eager resolution, and runtime lookup from the previous
  reset repair.
- Implementation-independent verification: both engines must reject unresolved
  compiler and collection references; accept local, empty, relative, forward,
  cyclic, and collision cases; reject legacy identifiers and an invalid
  manifest; and reject the invalid schema during real workerd module startup.
  The full packaged-consumer release gate must pass.

## Round history

| Round | Snapshot/head | Repair | Result |
| ---: | --- | --- | --- |
| 0 | `22f6d34dc` | Initial mixed-Zod and Worker bundle repair | Review exposed runtime and schema-engine gaps. |
| 1 | `f6f6fe8ebd59858dd3cdbcffa36e392ef857c103` | Harden bundle composition and introduce the edge validator | Review exposed dialect and manifest parity gaps. |
| 2 | `d33a8c519667ce91d08f8ab8a6410587a303d169` | Align draft and edge semantics | Review exposed collection graph handling gaps. |
| 3 | `b5919330c14861b37cde4fbde6051dfece86a657` | Preserve the manifest schema graph | Review exposed independent-root handling gaps. |
| 4 | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | Preserve manifest schema roots | Review exposed unresolved-reference acceptance in both fallback paths. |
| 5 | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | Architecture reset: shared resource planning and eager reference resolution | Full `gate:mcpfn-release` passed; no post-push feedback refetch was performed. |
| 6 | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` -> `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f` | Expand the reset repair to the full draft-07 resource graph and stabilize Worker diagnostics | Published as `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f`; no post-push feedback refetch was performed. |
| 7 | `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f` | Preserve relative-resource bases, reject legacy `id`, strengthen empty-reference coverage, and clear new static-analysis findings | Focused parity tests and the full packaged-consumer/workerd release gate pass; this ledger-bearing commit is the round's single publication, after which the workflow terminates without refetching. |

## Current round

- Starting head: `a48674cd06ea12de3f3a0efd738ec3a6b179fc5f`
- Mode: `architecture_reset`
- Snapshot: 48 total threads and 20 unresolved threads at the starting head;
  all thread and nested-comment pages were complete. Fourteen unresolved
  threads were already fixed or stale, two were invalid, and four were current.
  The supplementary Sonar snapshot reported two current maintainability issues.
- Valid findings before/after: 6 / 0 (three schema-parity and regression-test
  findings, one ledger-consistency finding, and two static-analysis findings).
- Newly discovered defects: an internal relative-resource namespace could have
  aliased an absolute user identifier; a regression test now proves those
  namespaces remain distinct for both engines.
- Fix-induced regressions: none found.
- Deferred blockers and verification gaps: hosted CI and post-push reviewer
  analysis are intentionally unverified. Focused typecheck and 80 parity and
  manifest tests pass, and `npm run gate:mcpfn-release` passes every package,
  workerd, pack, and installed-consumer step.
