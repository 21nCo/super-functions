---
title: Workflows and agents
description: Compose chains, parallel work, routers, state graphs, and agents.
---

# Workflows and agents

Subpath exports include chains, parallel orchestration, routers, state graphs, and ReAct, tool, plan-execute, and multi-agent patterns. Keep the model, tool policy, and application state explicit when composing them. Use the [package export map](/docs/reference/package-exports) to select the narrow import path.

Graph resumption requires a checkpoint store with atomic `take(id)`; a save/load-only custom store fails before node execution. The built-in in-memory store keeps up to 1000 entries, evicts the oldest, and does not survive process restart. A consumed checkpoint cannot be replayed after a failed node; reconcile any external effect at the application layer. This is at-most-once checkpoint admission, not exactly-once execution.

Inject a durable store for cross-process recovery and test its atomic consumption under concurrency. The [state graph source](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/graph/state_graph.ts) and [checkpoint interface](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/graph/checkpoint.ts) define the contract.

## A runnable sequential workflow

```ts
import { Chain } from "langfn/orchestration";

const summarize = Chain.sequential([
  (input: string) => input.trim(),
  (input: string) => ({ text: input, characters: input.length }),
]);
console.log(await summarize.run("  example  "));
// { text: "example", characters: 7 }
```

Each step receives the previous step's output. An exception rejects `run()` and later steps do not execute. A model call can be a step, for example `(text: string) => model.complete({ prompt: text })`; add cancellation and bounds when integrating external calls.

## Parallel and routed work

```ts
import { Chain } from "langfn/orchestration";

const analyze = Chain.parallel<string>([
  (text) => text.length,
  (text) => text.toUpperCase(),
]);
console.log(await analyze.run("hello")); // [5, "HELLO"]

const route = Chain.router<string, string>({
  router: (text) => text.length > 20 ? "long" : "short",
  routes: {
    long: (text) => text.slice(0, 20),
    short: (text) => text,
  },
});
console.log(await route.run("hello")); // hello
```

Parallel results preserve step order. A router selecting an unregistered key throws a validation error. Chains are in-process composition; they do not provide durable checkpoints. Use the graph API and an appropriate checkpoint store when the host must resume across interruptions.
