---
title: Operations and limits
description: Deployment gates, retention, and evidence boundaries.
---

# Operations and limits

ReviewFn's release gate runs package suites, Docker containment cases, Action shell-input tests, and an external installed CLI pipeline. Docker images, Composio/Linear access, GitHub publication credentials, and the inference proxy need explicit setup. Local docs validation cannot prove those hosted systems.

The output is advisory. A `ready` verdict requires complete coverage and validated evidence; it is not a merge authorization. Required GitHub checks need a later calibrated policy and release. The publisher uses a neutral check and one profile summary for the exact reviewed head.

ReviewFn retains content-addressed artifacts and redacted logs. Transcripts require explicit `retainTranscript: true`. The CLI applies retention cleanup when saving a new run. Idle stores need scheduled `FileArtifactStore.deleteExpired()`, and an ambiguous retention or publication lock requires operator verification before removal. See [security details](/docs/reference/security).

Evaluation examples in the repository include retrospective, agent-labeled and limited live receipts. They are schema and integration evidence, not a held-out model quality estimate. Review [evaluation](/docs/reference/evaluation) before using these numbers to choose a model or policy.
