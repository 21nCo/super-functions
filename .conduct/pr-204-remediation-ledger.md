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
- Current assessed head: `6ae4a32b9604065dcbcad688aeef7b74aab8dfea`

## Defect families

| Family ID | Failed rounds | Current state | Last attempted head | Behavioral evidence |
| --- | ---: | --- | --- | --- |
| `schema-engine-parity` | 5 | Architecture reset expanded for draft-07 dependency traversal and empty URI references; repair verified locally | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | Old head accepted a dependency reference that later threw during validation and rejected `$ref: ""`; the repaired compiler and collection match Ajv in focused tests and real workerd startup passes. |
| `manifest-resource-graph` | 2 | Superseded by the coordinated `schema-engine-parity` repair | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | Forward, local, cyclic, sorted-manifest, independent-root, and synthetic-ID collision cases pass in the release gate. |
| `gate-diagnostic-stability` | 0 | Fixed locally | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | The Worker records module-startup rejection details and the host-side diagnostics assertion distinguishes acceptance from an unexpected rejection reason. |
| `worker-bundle-runtime` | 0 | Fixed | `f6f6fe8ebd59858dd3cdbcffa36e392ef857c103` | Mixed root `zod` plus inlined MCP SDK starts under workerd and completes an authenticated MCP tool call. |
| `runtime-configuration` | 0 | Fixed | `d33a8c519667ce91d08f8ab8a6410587a303d169` | Worker compatibility flags and edge-safe validator selection are exercised by the real workerd gate. |
| `dependency-policy` | 0 | Invalid finding | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | `zod` is intentionally a build-time dependency for bundle inlining; it is not required at consumer runtime. |
| `regex-test-interpretation` | 0 | Invalid finding | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | The cited third argument was test metadata rather than a validator option; the malformed-pattern assertion passes. |

## Architecture reset: `schema-engine-parity`

- Shared invariant: every `$ref` accepted during schema registration or manifest
  validation resolves inside that compiler or collection before startup can
  succeed. Forward and cyclic collection references remain valid, and every
  anonymous document retains its own local-fragment root.
- Faithful old-head reproduction: on
  `9728d2b39f5a512ab55cd3b2a918686ae83ededa`, both
  `createSchemaCompiler("cfworker").compile({ $ref: missing })` and
  `validateSchemaCollection(..., "cfworker")` returned successfully; the
  unresolved reference threw only on later data validation. On
  `6ae4a32b9604065dcbcad688aeef7b74aab8dfea`, a valid local `$ref` beneath a
  dependency named `type` compiled but threw during fallback data validation,
  while an empty current-resource `$ref` was rejected during fallback
  compilation; Ajv accepted and validated both.
- Coordinated plan: centralize collision-safe resource planning, build the same
  resource lookup used by the Cloudflare validator, supplement its traversal
  with a draft-07-aware schema walk for `dependencies`, normalize empty
  references against the active resource base, check every indexed `$ref`
  target before accepting a compiler or collection, and use that same lookup
  for runtime validation. Share the plan across registration and manifest
  validation.
- Implementation-independent verification: both engines must reject unresolved
  compiler and collection references; accept local, forward, cyclic, and
  collision cases; reject an invalid manifest; and reject the invalid schema
  during real workerd module startup. The full packaged-consumer release gate
  must pass.

## Round history

| Round | Snapshot/head | Repair | Result |
| ---: | --- | --- | --- |
| 0 | `22f6d34dc` | Initial mixed-Zod and Worker bundle repair | Review exposed runtime and schema-engine gaps. |
| 1 | `f6f6fe8ebd59858dd3cdbcffa36e392ef857c103` | Harden bundle composition and introduce the edge validator | Review exposed dialect and manifest parity gaps. |
| 2 | `d33a8c519667ce91d08f8ab8a6410587a303d169` | Align draft and edge semantics | Review exposed collection graph handling gaps. |
| 3 | `b5919330c14861b37cde4fbde6051dfece86a657` | Preserve the manifest schema graph | Review exposed independent-root handling gaps. |
| 4 | `9728d2b39f5a512ab55cd3b2a918686ae83ededa` | Preserve manifest schema roots | Review exposed unresolved-reference acceptance in both fallback paths. |
| 5 | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | Architecture reset: shared resource planning and eager reference resolution | Full `gate:mcpfn-release` passed; no post-push feedback refetch was performed. |
| 6 | `6ae4a32b9604065dcbcad688aeef7b74aab8dfea` | Expand the reset repair to the full draft-07 resource graph and stabilize Worker diagnostics | Focused tests, real workerd startup, and the full release gate pass locally; publication is pending the single reviewed commit. |

## Current round

- Starting head: `6ae4a32b9604065dcbcad688aeef7b74aab8dfea`
- Mode: `architecture_reset`
- Snapshot: 44 total threads and 19 unresolved threads at the starting head;
  all thread and nested-comment pages were complete. Fourteen unresolved
  threads were already fixed or stale, and two were invalid.
- Valid root causes before/after: 2 / 0 (`schema-engine-parity` covered two
  sibling comments; `gate-diagnostic-stability` covered one comment).
- Newly discovered defects: none beyond the three current review comments.
- Fix-induced regressions: none found.
- Deferred blockers and verification gaps: hosted CI and post-push reviewer
  analysis are intentionally unverified. The first full-gate attempt stopped at
  an output-free `client:build` failure; the direct client build passed and a
  clean full-gate rerun passed every step.
