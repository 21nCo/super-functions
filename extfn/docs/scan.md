# extfn scan

`extfn scan` analyzes built extension outputs for review-blocking and store-readiness concerns.

## Strict by default

Default behavior:

- error-severity findings return a non-zero exit code
- warning and info findings still appear in the report
- manual-review reminders are preserved but do not block by themselves

Opt-out behavior:

```bash
npm exec extfn scan -- --config extfn.config.ts --no-strict
npm exec extfn package -- --config extfn.config.ts --no-strict
```

`--no-strict` does not suppress findings. It only changes gating behavior.

## Report model

Each finding includes:

- `ruleId`
- `severity`
- `category`
- `actionability`
- `target`
- `message`
- `file` when available
- `details` when available

Top-level report fields:

- `ok`
- `strict`
- `generatedAt`
- `configPath`
- `targets`
- `findings`
- `summary`

Formats:

- `text`
- `json`
- `sarif`

## Rule coverage in this repo

Current rule families:

- remote hosted code
- insecure transport
- dynamic execution
- risky permissions and permission breadth
- externally connectable scope
- CSP issues
- content-script socket usage
- manual-review reminders for privacy, single purpose, and store listing readiness

The rule layer evaluates emitted manifests plus built files, so package-owned integrations can contribute manifest state without needing an extfn-local duplicate contract.

## Structured observability

Structured scan and failure logs redact sensitive fields by default. If payloads contain keys such as `token`, `secret`, `password`, or `cookie`, those values are replaced with `[REDACTED]`.

This is why the report model is suitable for local automation and CI output without blindly leaking sensitive values.

## Practical examples

Human-readable scan:

```bash
npm exec extfn scan -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
```

SARIF:

```bash
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts --format sarif
```

Custom report directory:

```bash
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts --report-dir extfn/examples/svelte-datafn-demo/dist/custom-scan
```

## Packaging interaction

`extfn package` runs the scanner first unless you pass `--no-scan`.

Default:

- blocking scan findings prevent archive emission

Relaxed:

- `--no-strict` still writes the report
- the archive is emitted anyway

## Example matrix

```bash
npm exec extfn scan -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts
```
