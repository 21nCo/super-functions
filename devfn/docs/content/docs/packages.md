---
title: Packages
description: Map DevFn's eight packages to their responsibilities.
---

# Packages

| Package | Responsibility |
| --- | --- |
| `@devfn/cli` | `devfn` command, initialization, diagnostics, lifecycle, and JSON receipts. |
| `@devfn/core` | Dependency plans, journals, receipts, rollback, and diagnostics. |
| `@devfn/config` | Manifest discovery, validation, digest trust, and policy. |
| `@devfn/ports` | Lock-protected machine port leases, reconciliation, and reports. |
| `@devfn/processes` | Native process supervision, logs, readiness, and ownership. |
| `@devfn/compose` | Worktree-scoped Docker Compose infrastructure. |
| `@devfn/proxy` | Shared Caddy route control for `.localhost` names. |
| `@devfn/testing` | Deterministic fixtures and fake listeners. |

The packages expose separate public entry points. Use the CLI for the supported end-to-end workflow; lower-level packages are for integrations that preserve DevFn's identity, trust, and ownership contracts. Detailed source guides are under [reference](/docs/reference).
