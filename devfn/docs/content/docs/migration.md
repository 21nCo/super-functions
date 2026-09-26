---
title: Migrating a project
description: Adopt DevFn while preserving existing startup and data paths.
---

# Migrating a project

Preserve existing scripts and Compose data. Run `devfn init`, inspect confirmed and proposed detections, then edit the manifest until every command, dependency, port, profile, and health check is explicit. Run `devfn doctor --trust` and resolve prerequisites and exact-port collisions before the first start.

Back up any pre-existing path named by `environmentOutputs[].path`; DevFn overwrites configured outputs and does not restore previous contents. Start with a minimal profile, compare behavior against manual startup, then add full, OAuth, test, or docs profiles. Verify that `devfn down` preserves databases and volumes before making it the daily workflow.

To roll back, run `down`, inspect the configured runtime directory and output paths, and remove only DevFn-generated files that did not replace user content. Then remove the manifest and resume the preserved scripts. The [source migration guide](/docs/reference/migration) gives the complete checklist.
