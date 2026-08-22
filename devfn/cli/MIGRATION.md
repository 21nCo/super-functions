# Migrating an existing project

1. Preserve all existing scripts and Compose data.
2. Run `devfn init`, inspect confirmed versus proposed detections, then rerun with `--yes` only when the preview is truthful.
3. Edit the manifest so every command, dependency, port, profile, and health check is explicit.
4. Run `devfn doctor --trust`; address missing runtimes and exact-port conflicts.
5. Start with a minimal profile and compare it with the existing manual startup flow.
6. Add full, OAuth, test, or docs profiles incrementally. Public tunnels must remain explicit.
7. Verify `devfn down` preserves databases and volumes before adopting it as the daily command.

Rollback by running `devfn down`, then inspect `runtimeDir` and every `environmentOutputs[].path` in the manifest before removing generated files. The default generated location is `.devfn/`, but custom paths may live elsewhere. Preserve any target that existed before DevFn adoption; cleanup does not know whether a configured output replaced user-owned content. Finally remove the DevFn manifest and continue using the preserved original scripts. Docker volumes and source configuration are not deleted.
