---
title: Streaming and tools
description: Handle cancellation, tool policy, and network boundaries.
---

LangFn exposes streaming model operations and a tool abstraction with JSON-schema definitions, policy checks, and execution context. Built-in tools include calculator, `api_call`, web search, and code execution. Tool authority and network access are host responsibilities; do not let untrusted model text choose privileged credentials or policy exceptions.

`api_call` permits public IPv4 literals by default. Hostnames and IPv6 literals require an explicit `allowedHosts` entry because portable fetch cannot validate and pin DNS results across Node and Workers. That allowlist trusts all addresses a hostname resolves to. `allowPrivateNetwork: true` is a broader opt-in. Redirects and URLs with embedded credentials are rejected. Use an egress proxy for dynamic hostname access.

The built-in `POST /stream` SSE route cancels model work when its Web Request signal aborts. The host adapter must stream the response and propagate disconnects to that signal; arbitrary custom handlers and adapters do not gain this behavior automatically. Configured retry signals remain active unless a per-call cancellation token overrides them. Read the [release gate contract](/docs/reference/release-gate) for these boundaries and the [tool source](https://github.com/21nCo/super-functions/tree/dev/langfn/typescript/src/tools) for concrete APIs.

## Define and execute a validated tool

The runtime parser and JSON schema serve different purposes: the parser validates actual calls; the JSON schema describes the tool to a model. Keep them equivalent.

```ts
import { Tool } from "langfn/tools";

const textLength = new Tool<{ text: string }, { length: number }>({
  name: "text_length",
  description: "Count UTF-16 code units in a string.",
  schema: {
    jsonSchema: {
      type: "object", properties: { text: { type: "string" } },
      required: ["text"], additionalProperties: false,
    },
    parse(value) {
      if (typeof value !== "object" || value === null || !("text" in value)
          || typeof value.text !== "string" || Object.keys(value).length !== 1) {
        throw new Error("Expected only a text string");
      }
      return { text: value.text };
    },
  },
  execute: ({ text }) => ({ length: text.length }),
});
console.log(await textLength.run({ text: "hello" })); // { length: 5 }
```

An invalid argument rejects with `ToolSchemaError`; a handler failure is wrapped as `ToolExecutionError` unless it is already a LangFn error. Tool output passes through the execution context's policy sanitization/redaction. A custom tool must still enforce its own resource authorization.

## Let an agent choose the tool

Continuing with `textLength` above and a configured tool-capable `model` from [Models and providers](/docs/models-and-providers):

```ts
import { LangFn } from "langfn";
import { ToolAgent } from "langfn/agents";

const lang = new LangFn({ model });
const agent = new ToolAgent({ lang, tools: [textLength], max_iterations: 3 });
const result = await agent.run("Use text_length to count hello.");
console.log(result.output);
```

The loop validates arguments, executes registered tools, and appends tool results to the conversation. Exhausting the iteration limit throws `AgentMaxIterationsError`. Register only the tools the current user is authorized to use; prompts do not grant authority.
