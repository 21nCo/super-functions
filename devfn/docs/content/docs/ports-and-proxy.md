---
title: Ports and localhost routes
description: Allocate per-worktree ports and publish concrete local URLs.
---

`@devfn/ports` uses machine-local locking and worktree identity to allocate and reconcile exact, preferred, ranged, ephemeral, and contiguous-block ports. `exact: true` fails closed on collision. Public port exposure needs an explicit manifest choice and `--allow-public` on each start. Inspect allocations with `devfn ports` and the full machine registry with `devfn ports report`.

`@devfn/proxy` manages one lock-protected Caddy route registry with concrete `.localhost` names and loopback targets. It validates generated configuration before reload and refuses to take over an unrelated Caddy admin endpoint. Hostname templates accept `{project}` and `{instance}` and must resolve to `.localhost`.

DevFn returns HTTP URLs only for explicit hostname routes or ports named by HTTP health checks. A database or arbitrary TCP listener remains a transport allocation rather than an invented HTTP URL. The [configuration reference](/docs/reference/configuration) covers port and hostname fields, while [ports](/docs/reference/ports) and [proxy](/docs/reference/proxy) document package behavior.
