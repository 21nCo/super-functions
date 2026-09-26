---
title: Getting started
description: Install CliFn and run your first parser-independent action.
---

## Install

```sh
npm install @clifn/core
```

CliFn is a toolkit, not an executable or parser. Keep your existing command registration in `commander`, `cac`, `node:util.parseArgs`, or another parser. Import the pieces you need by public subpath.

## Run an action

```ts
import { runAction } from "@clifn/core/runner";

const exitCode = await runAction(
  async ({ name }, ctx) => {
    ctx.output.info(`hello ${name}`);
  },
  { name: "world" },
  { mode: "text" },
);

process.exitCode = exitCode;
```

`runAction()` provides a normalized working directory, environment, output service, diagnostic sink, subprocess service, scaffold service, and `nonInteractive` flag. An action can return `exitCode`, `data`, and diagnostics; thrown errors become exit code 1. JSON mode emits a stable `CLIFN_RUNNER_FAILED` envelope; text mode writes the failure message. In JSON mode, returned `data` is emitted as JSON. See [CLI builder](/docs/cli-builder) for parser wiring and [output and diagnostics](/docs/output-and-diagnostics) for formatting.

The [package README](/docs/reference/core-readme) contains working examples for `commander`, `cac`, and raw `parseArgs`, along with the established compatibility imports.
