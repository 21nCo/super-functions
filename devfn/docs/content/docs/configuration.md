---
title: Configuration
description: Declare project identity, ports, processes, Compose services, and profiles.
---

DevFn discovers `devfn.config.ts`, `.js`, `.mjs`, `.cjs`, or `.json` while walking upward. Each manifest has `version: 1`, a stable `project.id`, and named profiles. It may define ports, native processes, Compose services, hostname routes, prerequisites, environment outputs, and a repository-relative organization policy.

JavaScript-family manifests are executable but must be self-contained; imports and `require()` are rejected. JSON is parsed as data. Both forms require digest-bound trust before loading. Repository-relative paths reject absolute paths, `..` traversal, and symlink escape. References and dependency cycles are validated before lifecycle mutation.

A port can select exact, preferred, range, ephemeral, loopback/public, or contiguous-block allocation. Processes declare an adapter, command or script, dependencies, readiness, environment allowlist, and optional secret names. Compose services select a declared service, port mappings, health, and persistence. Profiles select these resources transitively and may enable the shared proxy.

Read the [complete configuration reference](/docs/reference/configuration) for field shapes, adapter values, health check examples, hostname templates, and policy rules. Treat examples as a starting point and verify every process command before trusting a manifest.
