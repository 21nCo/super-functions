# DevFn v0.1 contract

## Configuration

`devfn.config.ts`, JavaScript variants, or JSON define versioned semantic intent: project identity, named ports, native processes, Compose services, dependency-ordered profiles, health checks, prerequisites, environment outputs, and proxy hostnames. TypeScript and JavaScript manifests require digest-bound trust, execute from the verified snapshot, and cannot import executable dependencies.

## Identity and state

The instance key hashes canonical repository identity, real worktree path, and project ID. Machine state lives under `$XDG_STATE_HOME/devfn` or the platform user's local state directory. Project runtime receipts and logs default to ignored `.devfn/instances/<instance>/` paths.

Registry mutations use an exclusive lock plus atomic rename. Allocations distinguish planned, active, stale, released, and externally occupied state. Exact ports fail closed; preferred/range/fallback ports reallocate; explicitly ephemeral requirements ask the OS for a temporary port. Cohesive `block` requirements receive contiguous ports.

## Lifecycle

`up` validates trust/configuration, resolves the profile graph, reserves ports, writes runtime environment, starts dependencies, waits for health, updates explicit Caddy routes, activates leases, and returns a receipt. Every successful mutation is persisted. Failure walks the journal in reverse and cleans only resources started by that invocation.

`down` resolves the exact worktree instance, verifies process birth identity, stops its process groups and Compose services, removes its proxy routes, and releases its leases. Persistent volumes are never deleted.

## Adapters and boundaries

Native adapters cover command, npm, Corepack-pinned pnpm, Turbo, Wrangler, Xcode, and ExtFn workflows. Compose retains conventional container ports and uses generated loopback mappings unless public exposure is explicit. Caddy is a DevFn-owned singleton with locked explicit routes and safe reloads; unrelated Caddy instances are never reconfigured. Public tunnels remain explicit profile commands.

## Output and compatibility

Commands support deterministic JSON receipts and stable `DEVFN_*` error codes. macOS and Linux are the validated v0.1 hosts. Windows-aware process identity and termination paths are present but require Windows CI before support is declared.
