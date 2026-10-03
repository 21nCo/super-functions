---
title: Output and diagnostics
description: Use text or JSON output and stable, redacted diagnostic reports.
---

`createOutput()` supplies `debug`, `info`, `success`, `warn`, `error`, `json`, `table`, and `spinner`. Use `@clifn/core/output` for new CLIs; `@clifn/core/ui` remains the compatibility terminal helper path.

```ts
import { createOutput } from "@clifn/core/output";

const output = createOutput({ mode: "json", quiet: false });
output.info("loading");
output.json({ ok: true, count: 3 });
```

In text mode, messages have stable level prefixes; errors go to stderr. In JSON mode, messages become one JSON record per line and spinners do nothing. `quiet` suppresses non-error messages and tables; `debug` requires `verbose`. `json(value)` writes a JSON line directly. Tables use explicit columns and deterministic row order supplied by the caller. Inject `stdout` and `stderr` callbacks for tests or embedding.

## Diagnostics

`@clifn/core/diagnostics` defines `Diagnostic` with `code`, `severity`, `message`, optional `path`, and optional `details`. Use `createDiagnostic`, `sortDiagnostics`, `redactDiagnostics`, `formatDiagnosticsText`, and `formatDiagnosticsJson` to build consistent reports.

```ts
import {
  createDiagnostic,
  formatDiagnosticsJson,
  redactDiagnostics,
} from "@clifn/core/diagnostics";

const diagnostics = [createDiagnostic({
  code: "INPUT_MISSING",
  severity: "error",
  message: "A target is required",
})];
process.stdout.write(formatDiagnosticsJson(redactDiagnostics(diagnostics)));
```

Redaction applies to diagnostic `details`; applications should still avoid putting credentials in messages or paths. Formatters sort diagnostics and add a trailing newline. Consult the [export reference](/docs/reference/exports) for types and the [source](https://github.com/21nCo/super-functions/blob/dev/clifn/core/src/diagnostics.ts) for redaction rules.
