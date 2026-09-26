---
title: Getting started
description: Install ReviewFn and run a local advisory review.
---

# Getting started

ReviewFn requires Node.js 22 or newer, Git, a supported Codex CLI, and Docker for approved tests. Install the CLI as a development dependency in the repository being reviewed:

```sh
npm install --save-dev @superfunctions/reviewfn-cli
npx reviewfn init
npx reviewfn preflight --base origin/main --head HEAD --issue ENG-123
npx reviewfn review --base origin/main --head HEAD --issue ENG-123
```

`init` creates versioned `.reviewfn/config.json` and `.reviewfn/policy.json`. Review and edit them before running inference. `preflight` checks adapter, harness, model/auth, Docker, policy, and context compatibility. `review` captures committed revisions and writes `.reviewfn/output/report.json`, `.reviewfn/output/report.md`, and content-addressed evidence under `.reviewfn/output/artifacts` (or `<output>/artifacts` when `--output` is set). Ignore generated output and artifacts in the consumer repository.

The local CLI also supports `render --input report.json` and `evaluate --input evaluation.json`. `publish` is a separate command for a trusted GitHub job. The [CLI source](https://github.com/21nCo/super-functions/blob/dev/reviewfn/cli/src/main.ts) lists the current flags. Use [configuration](/docs/reference/configuration) for adapters, model authentication, test argv, and retention settings.

For a setup without connected services, use only the `repository-markdown` context adapter. For Linear, configure `composio-linear` with an explicit account, expected workspace, and issue key. Never put credential values into the config files; `credentialEnv` records an environment variable name.
