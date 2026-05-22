---
title: Reference
description: The canonical reference for filefn — every route, every error, every event, every schema, every config knob, the changelog.
---

# Reference

Everything in this section is generated from or kept in sync with the kernel source. When the kernel ships a new error code, this section gets a new row in the same release.

| Page | What's there |
| --- | --- |
| [Routes](./routes) | Every HTTP route, request body, response body, status, error codes. |
| [Errors](./errors) | Every error code, status, message, common causes. |
| [Events](./events) | Every event type with its payload. |
| [Schema](./schema) | Every DB table, every column, every index. |
| [Envelopes](./envelopes) | The `{ ok, data }` / `{ ok, error }` shape. |
| [Configuration](./configuration) | Every knob in `FileFnConfig`. |
| [Changelog](./changelog) | Notable releases. |

## See also

- [API explorer](../../api/filefn) — interactive OpenAPI explorer.
