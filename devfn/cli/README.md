# DevFn

DevFn runs heterogeneous local environments through one command contract while keeping application processes native and infrastructure Compose-backed where appropriate.

```bash
npx @devfn/cli init
npx @devfn/cli init --yes
npx @devfn/cli doctor --trust
npx @devfn/cli up --profile default
npx @devfn/cli status --json
npx @devfn/cli logs app
npx @devfn/cli down
npx @devfn/cli domains register dev.example.test --tls internal
npx @devfn/cli domains list
```

Registering a domain requires it to resolve already, and only to loopback addresses (`127.0.0.1`, or `::1` where available). A reserved name such as `dev.example.test` does not resolve until you configure local DNS for it yourself; DevFn never edits resolver, hosts or trust-store configuration.

Profiles that declare public processes or ports require `--allow-public` on every start.
`devfn ports gc` reconciles leases and retires listener claims with conclusive evidence. It removes the proxy routes of an instance only when its recorded process and container owners, including those of failed or interrupted starts, are all verified dead (for example a deleted worktree); an owner whose identity cannot be read counts as running. Finally, gc collects released records.
`devfn restart` validates the selected profile and registered domains, then reserves replacement ports before stopping a ready instance. A rejected domain, route, or port selection leaves that instance running. After those checks it stops the instance and starts it again from the current working tree. If that start fails, the previous processes are not relaunched and the error says so. Cleanup of the failed start can itself fail and leave some of its new processes or containers running; when the error reports cleanup errors, run `devfn down` again.

The first load of any manifest requires `--trust` because JSON and executable manifests can both declare lifecycle commands. Trust is bound to the manifest digest, so edits require review and trust again. Lifecycle mutations return receipts in JSON mode; read-only commands return command-specific structured data, and failures use stable error codes. Runtime files are written with restrictive permissions under `.devfn/` by default.

For automation, `devfn up --json` emits one lifecycle receipt object containing `state`, `instanceId`, `invocationId`, allocations, managed processes/services, and resolved URLs. Failures emit `{ "ok": false, "error": { "code": "DEVFN_*", "message": "..." } }` and exit nonzero. Treat fields not documented here as additive.

DevFn v0.1 uses transactional CLI-managed state rather than a daemon. Runtime logic is platform-aware; macOS and Linux are the validated first-release hosts, while Windows process ownership is implemented but requires platform CI before it is declared supported.
