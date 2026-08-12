# extfn CLI

The shipped binary is `extfn`.

## Global options

```text
Usage: extfn [options] [command]

Options:
  --json
  --quiet
  --verbose
  --color
```

`--json` switches command output to machine-readable mode. `--quiet` and `--verbose` are shared CLI concerns provided through `clifn`.

## dev

```text
Usage: extfn dev [options]

Options:
  --config <path>
  --target <target>
  --open
  --no-open
  --browser <browser>
```

Behavior:

- `extfn dev` watches exactly one target.
- If the config declares multiple targets, `--target` is required.
- The unpacked extension is emitted under `dist/<target>-dev`.
- `--open` tries to launch a browser session.
- `--no-open` prints the unpacked extension path and keeps watching.
- Firefox launch support opens the browser to `about:debugging#/runtime/this-firefox`; loading is still manual.

Examples:

```bash
npm exec extfn dev -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts --target chromium-mv3 --no-open
npm exec extfn dev -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts --target firefox-mv3 --open --browser firefox
```

## build

```text
Usage: extfn build [options]

Options:
  --config <path>
  --target <target>
```

Behavior:

- Builds all configured targets by default.
- `--target` accepts one target or a comma-separated target list.
- Uses `@extfn/vite` as the only build engine.
- Writes unpacked production outputs under `dist/<target>`.

Examples:

```bash
npm exec extfn build -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn build -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts --target chromium-mv3,firefox-mv3
```

## scan

```text
Usage: extfn scan [options]

Options:
  --config <path>
  --target <target>
  --report-dir <path>
  --format <format>
  --no-strict
```

Behavior:

- Scans built outputs and writes JSON reports under `dist/scan` by default.
- `--format text` prints the human summary.
- `--format json` returns the structured JSON payload.
- `--format sarif` emits SARIF for review tooling.
- Strict mode is on by default.
- `--no-strict` keeps the same findings but returns success instead of failing on error-severity findings.

Examples:

```bash
npm exec extfn scan -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts --format sarif
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts --no-strict
```

## package

```text
Usage: extfn package [options]

Options:
  --config <path>
  --target <target>
  --out-dir <path>
  --no-scan
  --no-strict
```

Behavior:

- Builds first if required.
- Runs `scan` by default before emitting archives.
- Chromium archives use `.zip`.
- Firefox archives use `.xpi`.
- `--no-scan` skips the scan step entirely.
- `--no-strict` keeps scan report generation but does not block archive emission on error findings.

Examples:

```bash
npm exec extfn package -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn package -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts --target firefox-mv3
npm exec extfn package -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts --no-strict
```

## Recommended repo-root validation matrix

```bash
npm exec extfn -- --help
npm exec extfn build -- --target chromium-mv3 --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn scan -- --target chromium-mv3 --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn build -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn package -- --target firefox-mv3 --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn build -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts
```
