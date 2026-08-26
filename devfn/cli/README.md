# DevFn

DevFn runs heterogeneous local environments through one command contract while keeping application processes native and infrastructure Compose-backed where appropriate.

```bash
npx devfn init
npx devfn init --yes
npx devfn doctor --trust
npx devfn up --profile default
npx devfn status --json
npx devfn logs app
npx devfn down
```

Profiles that declare public processes or ports require `--allow-public` on every start.

The first load of any manifest requires `--trust` because JSON and executable manifests can both declare lifecycle commands. Trust is bound to the manifest digest, so edits require review and trust again. Lifecycle mutations return receipts in JSON mode; read-only commands return command-specific structured data, and failures use stable error codes. Runtime files are written with restrictive permissions under `.devfn/` by default.

For automation, `devfn up --json` emits one lifecycle receipt object containing `state`, `instanceId`, `invocationId`, allocations, managed processes/services, and resolved URLs. Failures emit `{ "ok": false, "error": { "code": "DEVFN_*", "message": "..." } }` and exit nonzero. Treat fields not documented here as additive.

DevFn v0.1 uses transactional CLI-managed state rather than a daemon. Runtime logic is platform-aware; macOS and Linux are the validated first-release hosts, while Windows process ownership is implemented but requires platform CI before it is declared supported.
