# DevFn security

- Every DevFn manifest can declare lifecycle commands, so the CLI refuses to load JSON, TypeScript, or JavaScript until the user records trust for its exact digest with `--trust`. JSON is parsed directly from the verified bytes; executable manifests run from a private copy of those same bytes and must be self-contained, with imports and `require()` rejected so dependency files cannot bypass the digest boundary.
- Runtime children inherit a small base environment plus explicit `envAllowlist` entries. Sensitive-looking keys must also be listed in `secretEnv`; a detached wrapper redacts those effective values before native-process logs are persisted. Literal values are rejected only when their key looks sensitive, so review every manifest literal. Compose logging is disabled for services with `secretEnv` because Docker otherwise retains historical unredacted logs. Secrets are not persisted in the registry or lifecycle receipt.
- Generated environment and state files use owner-only modes (default `0600`); their directories use `0700`. Existing files are explicitly re-permissioned after each write.
- Local ports and proxy targets bind to loopback unless a manifest explicitly selects public exposure. Profiles containing public processes or ports require the separate `--allow-public` confirmation on every start. A public Cloudflare tunnel must never be inferred.
- Repository-relative process, Compose, runtime, policy, and output paths are validated against lexical and symlink path escape.
- PID ownership uses a birth signature where the host exposes one. DevFn refuses to stop a reused PID.
- `down` stops only the exact worktree instance. Ordinary shutdown removes no persistent Docker volumes.
- Project hostnames must be concrete `.localhost` names. DevFn manages only a Caddy process it started itself and refuses to overwrite an unrelated Caddy admin endpoint.
- Volume deletion, database reset, public tunnels, and other destructive operations are outside ordinary lifecycle commands and require separate explicit tooling and confirmation.
