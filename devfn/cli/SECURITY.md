# DevFn security

- A `devfn.config.ts` or JavaScript manifest is executable repository code. DevFn refuses to load it until the user records trust for its exact digest with `--trust`.
- Runtime children inherit a small base environment plus explicit `envAllowlist` entries. Sensitive keys must also be listed in `secretEnv`; a detached wrapper redacts those values before logs are persisted. Literal secrets are rejected from manifests and profile environment. Secrets are not persisted in the registry or lifecycle receipt, and machine output is redacted through CliFn.
- Generated environment and state files use mode `0600`; their directories use `0700`.
- Local ports and proxy targets bind to loopback unless a manifest explicitly selects public exposure. Profiles containing public processes or ports require the separate `--allow-public` confirmation on every start. A public Cloudflare tunnel must never be inferred.
- Repository-relative process, Compose, runtime, policy, and output paths are validated against path escape.
- PID ownership uses a birth signature where the host exposes one. DevFn refuses to stop a reused PID.
- `down` stops only the exact worktree instance. Ordinary shutdown removes no persistent Docker volumes.
- Project hostnames must end in `.localhost`; shared Caddy state has explicit routes and no catch-all.
- Volume deletion, database reset, public tunnels, and other destructive operations are outside ordinary lifecycle commands and require separate explicit tooling and confirmation.
