---
title: Getting started
description: Initialize, trust, inspect, and start a local profile.
---

Install or invoke `@devfn/cli` from the repository you want to run. `init` previews detected configuration; review it before accepting generated files. The first load of any manifest needs `--trust`, even for JSON, because it can declare lifecycle commands. Trust is bound to the exact manifest digest, so an edit requires review and trust again.

```sh
npx @devfn/cli init
# Review the preview, then write the manifest:
npx @devfn/cli init --yes
npx @devfn/cli doctor --trust
npx @devfn/cli up --profile default
npx @devfn/cli status --json
npx @devfn/cli logs app
npx @devfn/cli down
```

Profiles containing public processes or ports also require `--allow-public` on every start. `up --json` emits one lifecycle receipt with state, instance and invocation IDs, allocations, managed resources, and resolved URLs. Read-only commands return structured command data in JSON mode; failures use stable `DEVFN_*` codes and exit nonzero.

Runtime files default to `.devfn/` with owner-only permissions. If the manifest configures `environmentOutputs`, inspect and back up any pre-existing target file before starting: DevFn overwrites configured outputs and cannot restore their former contents. See the [migration guide](/docs/migration).
