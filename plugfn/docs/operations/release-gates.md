# PlugFn Release Gates

## Canonical command

The authoritative repo-root release proof is:

```bash
npm run gate:plugfn-release
```

This command is the only supported global readiness check for PlugFn. It emits a deterministic JSON result with step status, docs inventory status, and the final production-claim rule.

## Gate coverage

`npm run gate:plugfn-release` proves all of the following from the repository root:

1. `npm --prefix plugfn/core run build`
2. `npm --prefix plugfn/core run type-check`
3. `npm --prefix plugfn/core test -- --run`
4. `npm --prefix plugfn/core test -- --run tests/e2e/oauth-callback.test.ts tests/e2e/webhook-verification.test.ts`
5. `npm --prefix plugfn/client run build`
6. `npm --prefix plugfn/client run typecheck`
7. `npm --prefix plugfn/client test -- --run`
8. `npm --prefix plugfn/providers run build`
9. `npm --prefix plugfn/providers run typecheck`
10. `npm --prefix plugfn/providers test -- --run`
11. provider-specific gates:
   - `npm run gate:plugfn-provider-github`
   - `npm run gate:plugfn-provider-linear`
   - `npm run gate:plugfn-provider-gmail`
   - `npm run gate:plugfn-provider-notion`
12. `npm --prefix plugfn/cli run build`
13. `npm --prefix plugfn/cli run type-check`
14. `npm --prefix plugfn/cli test -- --run`
15. `python3 -m pytest -q plugfn/python/tests`
16. docs/status inventory checks for:
   - portable paths in public docs
   - package-name truth
   - current gate wording
   - readiness-matrix coverage for `github`, `linear`, `clickup`, `gmail`, and `notion`

## Production-ready claim rule

PlugFn still does not make blanket claims for every provider or vertical module.

A PlugFn provider or runtime surface may be described as production-ready only when both conditions are true on the same commit:

1. `npm run gate:plugfn-release` passes
2. the surface is marked `production` in [../provider-readiness-matrix.md](../provider-readiness-matrix.md)

Anything outside that boundary remains `beta`, `experimental`, `vertical-only`, or `unsupported` according to the matrix.

## Repo-root verification commands

These commands are the reproducible verification surface documented by Phase 08:

```bash
npm run gate:plugfn-release
npm run gate:plugfn-provider-github
npm run gate:plugfn-provider-linear
npm run gate:plugfn-provider-gmail
npm run gate:plugfn-provider-notion
npm test --workspace plugfn
npm test --workspace @plugfn/cli
python3 -m pytest -q plugfn/python/tests
```

## Phase 04 runtime semantics

Workflow lifecycle hardening in Phase 04 uses the following production-truth model:

- Trigger backend coverage: in-process `WebhookHandler` bindings only.
- Unregister semantics: disable/delete must detach the active local binding; if no live binding exists to detach, the runtime returns `WORKFLOW_TRIGGER_UNREGISTER_FAILED` instead of silently logging and continuing.
- Durability model: idempotent resume is DB-backed through `workflow_executions` state, so failed executions can resume after restart or from another engine instance when the same durable storage is shared.
- Delay semantics: process-local timers are not treated as production-safe. Delay steps fail closed with `WORKFLOW_DURABILITY_UNSUPPORTED` until a durable scheduler backend exists.

CLI diagnostics in Phase 04 use the following deterministic exit-code contract:

- `0`: runtime load, connection resolution, provider action, and any requested OAuth/webhook diagnostics all passed.
- `1`: validation or runtime/config loading failed before provider execution.
- `2`: provider registration, connection resolution, or action execution failed.
- `3`: requested webhook diagnostic failed.

## Phase 00 documentation checks

These checks are intentionally lightweight and only prove contract truth, not runtime readiness. They should look for:

- outdated scoped-package install instructions
- machine-specific local paths in public docs
- broad unsupported readiness language in the primary contract docs

Expected interpretation:

- old package names should be absent from public docs
- machine-specific absolute paths should be absent from public docs
- broad unsupported readiness claims should be absent from the primary contract docs

## Historical baseline at Phase 00

- repo-root release gate: not implemented yet
- global production-ready claim: not allowed
- provider truth source: [../provider-readiness-matrix.md](../provider-readiness-matrix.md)
