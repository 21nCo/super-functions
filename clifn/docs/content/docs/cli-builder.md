---
title: Build a CLI
description: Wire any parser to the shared action runner and preserve command ownership.
---

`runAction(action, options, runnerOptions)` executes a parsed action and returns a numeric exit code. Pass the parser's resolved options to it; keep command names, flags, validation, and help text in your CLI package. Parser packages remain consumer dependencies.

```ts
import { parseArgs } from "node:util";
import { runAction } from "@clifn/core/runner";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    json: { type: "boolean" },
  },
});

if (positionals[0] === "greet") {
  process.exitCode = await runAction(
    ({ name }, ctx) => {
      if (ctx.output.mode !== "json") ctx.output.info(`Hello, ${name}!`);
      return { data: { greeting: `Hello, ${name}!` } };
    },
    { name: values.name ?? "world" },
    { mode: values.json ? "json" : "text" },
  );
}
```

In text mode, emit user-facing messages with `ctx.output`. In JSON mode, returned `data` is serialized to stdout. `RunnerOptions` also accepts `quiet`, `verbose`, `color`, `cwd`, `env`, `stdout`, `stderr`, `nonInteractive`, and an `onDiagnostics` listener. The context's `exec` and `scaffold` services inherit its working directory; `exec` also inherits its environment.

Return `exitCode` for an expected product failure you have handled. An invalid or negative returned exit code normalizes to zero, so set explicit positive codes for failure cases. Thrown failures normalize to code 1. The runner does not print collected diagnostics automatically; use `onDiagnostics` or your own output policy to present them.

See the [runner source](https://github.com/21nCo/super-functions/blob/dev/clifn/core/src/runner.ts) and [package examples](/docs/reference/core-readme) for `commander` and `cac` integration.
