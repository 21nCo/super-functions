---
title: Observability and evaluation
description: Capture scoped traces, usage, feedback, and measured outcomes.
---

# Observability and evaluation

`langfn/observability` exports tracer, storage, cost meter, exporter, redaction, and span contracts. `langfn/evaluation` exports datasets, metrics, and evaluator helpers. Use them to measure configured model behavior and keep trace data scoped to the trusted tenant and actor.

HTTP feedback normalizes top-level tenant/user fields or nested `scope` and rejects conflicts. Cached completions create a fresh scoped trace, so feedback can refer to each returned trace ID. For SQL-backed custom trace stores, include tenant and user columns and query predicates. A local evaluator result only describes the frozen dataset, model, prompt, context, and budget used for that run.

The [release gate](/docs/reference/release-gate) details HTTP scope and trace-store requirements. See [observability exports](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/observability/index.ts) and [evaluation exports](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/evaluation/index.ts) for integration APIs.
