---
title: Lifecycle and diagnostics
description: Start, inspect, stop, and recover one worktree instance.
---

# Lifecycle and diagnostics

`devfn up` plans resources in dependency order, reserves ports before mutation, starts selected native processes and Compose services, verifies readiness, registers proxy routes, and returns a machine-readable receipt. If an invocation fails, rollback targets resources created by that invocation. `status`, `logs`, and `doctor` expose live state and diagnostics; `down` stops only the exact worktree instance.

There is no background daemon in version 0.1. State, journals, logs, and generated environment files are kept under the configured runtime directory, `.devfn/` by default. Process ownership uses a PID birth signature where the host supplies one, so cleanup refuses a reused PID.

Ordinary `down` does not delete persistent Docker volumes. It is also not a general reset command. Explicit configured environment outputs may have overwritten files that existed before adoption; inspect them before manual cleanup. The [core package](/docs/reference/core), [process supervisor](/docs/reference/processes), and [migration guide](/docs/reference/migration) describe lifecycle boundaries.
