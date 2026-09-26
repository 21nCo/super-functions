---
title: Review workflow
description: Follow exact revisions from context capture to validated report.
---

# Review workflow

ReviewFn identifies the base, head, merge-base, diff, configuration, policy, prompt, harness, model, and budget for each run. It freezes authoritative issue and repository context before inference. A source adapter rejects a dirty review root, while the CLI clones committed input into its own checkout so mutable caller files are excluded.

Approved test commands are argv arrays, not shell scripts. The test adapter runs them in a bounded Docker container against a committed archive. The review harness receives the frozen evidence and returns structured assessments and findings. The validator checks source IDs, requirements, exact-head code anchors, test receipts, evidence links, severity, and verdict consistency before a report can be ready.

Every extracted requirement resolves to exactly one assessment. The report separates execution (`completed`, `failed`, and other states), coverage (`complete` or `incomplete`), and verdict (`ready`, `changes_requested`, or `needs_verification`). A completed model call alone does not imply a valid review. Missing context, malformed output, timeout, quota, cancellation, stale head, or unsupported auth remains visible in the report.

Use the [report schema](/docs/reference/report-schema) for field-level rules and [security model](/docs/reference/security) for checkout, test, and inference isolation. To compare review quality, run [frozen evaluations](/docs/reference/evaluation) and retain their limitations.
