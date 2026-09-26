---
title: DevFn
description: Trusted lifecycle orchestration for local development.
---

DevFn coordinates native application processes, Docker Compose infrastructure, machine-local port leases, readiness, logs, diagnostics, and stable `.localhost` URLs through one command contract. It identifies each worktree instance so concurrent local environments do not silently share mutable resources.

Start with [getting started](/docs/getting-started), then define a [manifest](/docs/configuration) and operate a [profile](/docs/lifecycle). Review [trust and exposure](/docs/security) before loading a manifest or opening a public port. Existing projects should follow the [migration guide](/docs/migration).

DevFn does not replace HostFn deployment, browser evidence, ExtFn extension semantics, Docker Compose, Wrangler, or Xcode. It coordinates local runtimes through explicit adapters. Version 0.1 uses CLI-managed state rather than a daemon.
