---
title: Workflows and agents
description: Compose chains, parallel work, routers, state graphs, and agents.
---

# Workflows and agents

Subpath exports include chains, parallel orchestration, routers, state graphs, and ReAct, tool, plan-execute, and multi-agent patterns. Keep the model, tool policy, and application state explicit when composing them. Use the [package export map](/docs/reference/package-exports) to select the narrow import path.

Graph resumption requires a checkpoint store with atomic `take(id)`; a save/load-only custom store fails before node execution. The built-in in-memory store keeps up to 1000 entries, evicts the oldest, and does not survive process restart. A consumed checkpoint cannot be replayed after a failed node; reconcile any external effect at the application layer. This is at-most-once checkpoint admission, not exactly-once execution.

Inject a durable store for cross-process recovery and test its atomic consumption under concurrency. The [state graph source](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/graph/state_graph.ts) and [checkpoint interface](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/graph/checkpoint.ts) define the contract.
