---
title: Workflows and sync
description: Run provider actions and persisted integration jobs.
---

# Workflows and sync

PlugFn coordinates provider actions, workflows, sync jobs, checkpoints, events, and metrics. The TypeScript router includes workflow discovery, sync-job create/list/get/cancel, checkpoint upsert, event list, and metrics routes. Keep workflow execution server-side and authorize it against the derived principal.

The release contract describes DB-backed idempotent workflow resume. Process-local delay timers are not considered production-safe; delay steps fail closed until a durable scheduler exists. Read the [release gates](/docs/reference/release-gates) and [provider throttle runbook](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/provider-throttle-incident.md).
