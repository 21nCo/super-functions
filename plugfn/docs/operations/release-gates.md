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
4. `npm --prefix plugfn/providers test -- --run tests/webhook-raw-body.test.ts tests/e2e/oauth-callback.test.ts tests/e2e/webhook-verification.test.ts` (after provider build/typecheck)
5. `npm --prefix plugfn/client run build`
6. `npm --prefix plugfn/client run typecheck`
7. `npm --prefix plugfn/client test -- --run`
8. `npm --prefix plugfn/providers run build`
9. `npm --prefix plugfn/providers run typecheck`
10. `npm --prefix plugfn/providers test -- --run`
11. provider-specific gates:
   - `npm run gate:plugfn-provider-github`
   - `npm run gate:plugfn-provider-linear`
   - `npm run gate:plugfn-provider-clickup`
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
npm run gate:plugfn-provider-clickup
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

## Isolated npm packaging and registry reconciliation

Provider `build`, `typecheck`, and tests resolve `plugfn` through its installed public exports. They do not build `../core`, resolve sibling declarations, or alias sibling source. Install the prerequisite core artifact before testing providers; `plugfn@0.1.0` does not export the new `ActionContract` type or `resolveActionContract` runtime API used by the current providers and their lifecycle/wire tests.

Build and pack each package in its own directory after installing its declared dependencies. The CLI publishes only `dist`, its README, and its license. Provider-backed raw-body webhook and OAuth/webhook end-to-end suites live under providers tests and exercise the installed public core entry point. Core unit tests no longer import sibling providers.

Registry baselines inspected:

- `plugfn@0.1.0`: git head `7d2d6754af44f61830ed43c141c2c3c205996ef9`.
- `@plugfn/cli@0.0.3` and `@plugfn/client@0.0.1`: git head `c721fdfe1e5a372e4407b12d2bd5865d4162bc6c`.
- `@plugfn/providers@0.0.2`: git head `162d2c4c5e05c500c4e15b598cad183ef42cb8bd`.

These published histories diverge from the development snapshot; merging the registry branch is not the reconciliation strategy. Current CLI scaffolding already fixes the old unpublished `@superfunctions/plugfn` imports to public `plugfn` and `@plugfn/providers` names. Client source is unchanged from its published baseline.

The following published surfaces were intentionally removed by the ownership cutover, not accidentally lost packaging fixes:

- CLI `generate-types`, which generated empty configuration/action/trigger interfaces rather than provider types.
- Providers `forwardingProvider` and `managedMailProvider`, and their entries in `requiredMailProviderIds`; platform-owned forwarding and managed mailboxes belong to MailFn.
- Outbound mail actions and SMTP connection/configuration fields; outbound delivery belongs to SendFn.
- Core `BackupAlertEvent`, `BackupChannel`, `BackupChannelError`, `BackupChannelType`, `assertBackupChannelConfirmed`, and `buildBackupAlertEvent`.
- Core `ManagedMailboxIncidentInput`, `ManagedMailboxIncidentResult`, `ManagedMailboxPolicyError`, `ManagedMailboxSetupInput`, `ManagedMailboxSetupResult`, `ManagedMailboxState`, `enforceManagedMailboxSetup`, and `handleManagedMailboxIncident`.
- Core `EscrowRecoveryInput`, `ManagedMailboxSecurityAuditEvent`, `ManagedMailboxSecurityError`, `ManagedMailboxSecurityMetadata`, `ManagedMailboxSecurityMode`, `ManagedMailboxSecurityService`, `SetManagedMailboxSecurityModeInput`, `assertManagedMailboxSecurityMode`, and `buildManagedMailboxSecurityMetadata`.

Do not reintroduce obsolete exports or placeholder commands as compatibility shims. The approved `plugfn@0.2.0` release is a **breaking ownership cutover** relative to `plugfn@0.1.0`, not a compatible minor, despite its compatible new action-contract APIs. Future CLI/provider versions must exceed their actual registry latest versions (`0.0.3`/`0.0.2`), not merely the stale development manifests (`0.0.1`).
