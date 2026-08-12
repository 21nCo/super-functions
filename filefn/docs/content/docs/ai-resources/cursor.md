---
title: Cursor
description: Wire filefn into Cursor — MCP server, project rules, and recommended .cursorrules.
---

# Cursor

## MCP

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "filefn": {
      "type": "http",
      "url": "https://docs.filefn.dev/mcp"
    }
  }
}
```

Reload Cursor. The Composer panel now has search / fetch tools wired to the filefn docs.

## .cursorrules

```md
# filefn rules

This project uses filefn for file uploads, processing, and previews.

When asked about file uploads:
- Prefer @filefn/client (`uploadFile`, `resumeUpload`).
- Always pass a `policy` matching one defined on the server.
- Honour OPFS offline if `offline.enabled` is true.

When asked about server config:
- Use `createFileFn` from @filefn/server.
- Wire @superfunctions/db and @superfunctions/storage adapters.
- For processing, use processors from @filefn/processing.

Reference docs at https://docs.filefn.dev. Use the MCP search_docs / fetch_page tools to find the latest content.
```

## Project rules folder

For larger setups, create `.cursor/rules/filefn.md`:

```md
# filefn

@filefn/server is the kernel. @filefn/client is the browser SDK. @filefn/processing has bundled processors.

Routes are mounted via `fileFn.router.handle(request)`. The kernel returns `Response | null`; null means 404.

Errors throw `FileFnError` with a canonical `code` (e.g. `FILEFN_POLICY_NOT_FOUND`). On the client, errors are `FileFnHttpError`.

For more, query the filefn MCP server: search_docs / fetch_page / get_route / get_error.
```

## See also

- [MCP server](./mcp) — the underlying tools.
- [Skills](./skills) — pre-baked workflows.
