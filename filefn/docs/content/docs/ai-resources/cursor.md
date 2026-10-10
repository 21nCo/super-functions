---
title: Cursor
description: Use FileFn documentation and project rules as Cursor context.
---

# Cursor

Supply the [LLM context files](./llms-txt) using the context interface supported by your Cursor version. Example project rules:

```md
# FileFn

Documentation: https://filefn.com/docs

- Confirm installed @filefn/server and @filefn/client public contracts.
- Preserve policy checks, tenant context, and server-side authorization.
- Use CAS-capable stores.atomicKv when the FileFn server requires strict shared rate limits.
- Run the project's type checks and tests; do not infer live readiness from a local build.
```

This site does not implement a FileFn MCP service, expose executable skills, or guarantee editor-specific automatic discovery. [MCP integration](./mcp) and [recipes](./skills) require separate application ownership.
