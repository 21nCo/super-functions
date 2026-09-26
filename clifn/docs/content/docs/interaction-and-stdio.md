---
title: Prompts and JSON stdio
description: Interactive input, terminal feedback, and machine-readable pipes.
---

# Prompts and JSON stdio

`@clifn/core/prompt` exports the default `prompt` object and `createPrompt()` for an injected ask function. It supports `select`, `multiSelect`, `text`, and `confirm`. Use the runner's `nonInteractive` flag to decide whether your command should prompt or require flags; the prompt API itself does not infer that policy.

```ts
import { prompt } from "@clifn/core/prompt";
import { ui } from "@clifn/core/ui";

const target = await prompt.select("Target environment", ["local", "staging"]);
if (await prompt.confirm(`Continue with ${target}?`)) {
  ui.success(`selected ${target}`);
}
```

`@clifn/core/ui` retains the established `success`, `error`, `warn`, `info`, `spinner`, and `table` terminal helpers. For new CLI output policies, prefer the configurable `createOutput()` service described in [output and diagnostics](/docs/output-and-diagnostics).

`@clifn/core/stdio` exports `readJsonStdin<T>()` and `writeJsonStdout(value)`. The reader parses one JSON document from stdin and raises `InvalidJsonStdinError` on malformed input. The writer emits one serialized JSON document followed by a newline. Both accept injected streams for testing. Keep progress and human messages off stdout when a command promises machine-readable output.
