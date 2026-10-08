# @devfn/ports

Machine-local, lock-protected port leases with worktree instance identity, exact/preferred/range/ephemeral allocation, stale reconciliation, listener discovery, Docker mapping discovery, and generated inventory reports. Reports enumerate the complete machine registry, including other projects and profiles, and are not a current-selection view.

Selected proxy routes claim Caddy's listener ports across TCP and UDP. Reconciliation releases an abandoned claim only after its heartbeat has expired, its service leases are no longer active, neither committed nor pending proxy state contains its routes, and no live Caddy owner or admin listener remains. Malformed route or owner state retains the claim for inspection. A healthy route or proxy keeps the listener ports protected while sibling worktrees start and stop.
