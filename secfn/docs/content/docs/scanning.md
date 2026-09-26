---
title: Secret scanning
description: Run the core scanner and persist run metadata through the server.
---

# Secret scanning

`@secfn/core` exports the scanner engine, default rule pack, scanner interfaces, and table, JSON, and SARIF reporters. Use these pure APIs in a trusted host to scan selected source content. The server creates a scanner instance but scanning itself is a pure producer of findings; it does not automatically store run history.

To retain run history, call `vault.recordScanRun({ tenantId, startedAt, target, status, findingCount })` after scanning. Tenant-scoped scan history needs the schema version 2 column and version 3 index migration. Existing unowned rows remain hidden from tenant lists until a trusted ownership backfill is performed. The admin router exposes `GET /admin/scan-runs` through host authorization.

The old V0 specification mentions Git history scanning and pre-commit hooks as proposed features. Verify the current scanner exports and your host workflow before advertising those integrations. See [core package reference](/docs/reference/core) and [server package reference](/docs/reference/server).
