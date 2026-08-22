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

The first execution of a TypeScript or JavaScript manifest requires `--trust`. Trust is bound to the manifest digest, so edits require review and trust again. JSON commands return stable error codes and receipts. Runtime files are written with restrictive permissions under `.devfn/` by default.

DevFn v0.1 uses transactional CLI-managed state rather than a daemon. Runtime logic is platform-aware; macOS and Linux are the validated first-release hosts, while Windows process ownership is implemented but requires platform CI before it is declared supported.
