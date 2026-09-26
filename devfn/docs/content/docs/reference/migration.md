---
title: Migration guide
description: Adopt DevFn without losing existing scripts, outputs, or Compose data.
---

1. Preserve all existing scripts and Compose data.
2. Run `devfn init`, inspect confirmed versus proposed detections, then rerun with `--yes` only when the preview is truthful.
3. Edit the manifest so every command, dependency, port, profile, and health check is explicit.
4. Run `devfn doctor --trust`; address missing runtimes and exact-port conflicts.
5. Before the first start, back up every pre-existing file targeted by `environmentOutputs[].path`; DevFn overwrites configured outputs and cannot restore prior contents.
6. Before the first start, inspect the resolved Compose configuration and verify that each database mounts the intended existing volume. DevFn adds a worktree-specific project suffix, so an ordinary project-scoped named volume may resolve to a different, empty volume. Back up existing database contents and any data stored only in container writable layers; `down` removes DevFn-created containers.
7. Start with a minimal profile and compare it with the existing manual startup flow.
8. Add full, OAuth, test, or docs profiles incrementally. Public tunnels must remain explicit.
9. Verify `devfn down` preserves databases and volumes before adopting it as the daily command.

Rollback by running `devfn down`, then inspect `runtimeDir` and every `environmentOutputs[].path` in the manifest before removing generated files. The default generated location is `.devfn/`, but custom paths may live elsewhere. Preserve any target that existed before DevFn adoption; cleanup does not know whether a configured output replaced user-owned content. Finally remove the DevFn manifest and continue using the preserved original scripts. Docker volumes and source configuration are not deleted.
