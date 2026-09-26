---
title: CLI and administration
description: Use local diagnostics and a scoped admin adapter.
---

# CLI and administration

`@plugfn/cli` supplies project initialization, provider scaffolding, and `plugfn test` diagnostics. The test command is still being hardened and is not a full production-readiness proof. Use the [CLI source guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/cli/README.md) for commands.

`@plugfn/admin` exposes a function-owned Super Console capability and adapter through a project-owned public PlugFn facade. The host maps admin context to PlugFn identity and supplies project scope, authorization, audit, and high-assurance confirmation for destructive actions. The [admin guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/admin/README.md) lists supported actions and deliberately absent ones.
