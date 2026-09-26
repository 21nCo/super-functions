---
title: CLI workflow
description: Develop, build, scan, and package extension targets.
---

`@extfn/cli` ships the `extfn` binary. `dev` watches exactly one target and supports `--open`, `--no-open`, and `--browser`. `build` builds all config targets by default or a selected target list. `scan` analyzes emitted files and manifests. `package` always rebuilds the extension, scans by default, and writes store-uploadable archives.

```sh
npm exec extfn dev -- --config extfn.config.ts --target chromium-mv3 --no-open
npm exec extfn build -- --config extfn.config.ts --target chromium-mv3,firefox-mv3
npm exec extfn scan -- --config extfn.config.ts --format sarif
npm exec extfn package -- --config extfn.config.ts --target firefox-mv3
```

Global output flags are `--json`, `--quiet`, `--verbose`, and `--color`. Scan is strict by default: error-severity findings cause a nonzero exit. `--no-strict` preserves findings while allowing success; `package --no-scan` skips scanning. Use these opt-outs deliberately and review the reports before distribution. The [full CLI reference](/docs/reference/cli) lists every option and output path.
