# DevFn

DevFn is the local-development counterpart to HostFn: a portable command contract for native application processes, Docker-backed infrastructure, deterministic worktree identity, machine-local port leases, readiness, logs, diagnostics, and stable `.localhost` URLs.

## Packages

- `@devfn/cli` — independently installable CLI exposing the `devfn` command.
- `@devfn/core` — planning, lifecycle journals, receipts, rollback, and diagnostics.
- `@devfn/config` — manifest/policy validation, discovery, and trust.
- `@devfn/ports` — concurrency-safe allocations, leases, reconciliation, and inventory.
- `@devfn/processes` — neutral native process supervision and readiness.
- `@devfn/compose` — worktree-scoped Compose infrastructure.
- `@devfn/proxy` — shared Caddy route control.
- `@devfn/testing` — deterministic fixtures and fake listeners.

DevFn does not replace HostFn deployment, ProbeFn browser evidence, ExtFn extension semantics, Docker Compose, Wrangler, or Xcode. It coordinates those local runtimes through explicit adapters.

See [the configuration reference](./docs/configuration.md), [the v0.1 contract](./SPEC.md), and the CLI package's security and migration guides.
