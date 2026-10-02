---
title: Operations and limits
description: Key custody, adapter guarantees, and validation boundaries.
---

The host must provide a DB adapter with transactions for secret creation and rotation, and configurable repeatable-read isolation for audit metrics. Shared rate limiting requires a linearizable CAS store. The default in-memory limiter coordinates only one process. These capabilities are part of the deployment contract, not optional performance tuning.

Keep master keys, service tokens, and returned plaintext outside untrusted clients and logs. Admin reveal is a distinct confirmed and audited action. Use tenant, namespace, environment, and actor context derived from trusted authentication. Do not treat a query parameter as a new authorization scope.

The `secfn/SPEC.md` file is an older proposal; its dashboard, CLI, framework adapter, and scanning examples are not evidence of implemented packages. The current package manifests expose core, server, and runtime. Validate with focused package tests and a real DB migration before production rollout; a DocsFn build proves only the site structure.
