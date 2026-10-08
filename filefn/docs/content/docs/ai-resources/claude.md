---
title: Claude
description: Ground Claude in reviewed FileFn source and generated documentation context.
---

# Claude

Use the generated [LLM context files](./llms-txt) through the context mechanism supported by your Claude client. For repository work, add project-specific instructions to `CLAUDE.md`:

```md
# FileFn project instructions

- Read FileFn documentation at https://filefn.com/docs.
- Inspect the installed package versions and public exports before changing configuration.
- Keep file authorization, tenant context, and upload-session tokens intact.
- Verify changes with this repository's tests before running them against live storage.
```

These are instructions you own, not installed tools or an automatic workflow. This docs site does not implement a FileFn MCP endpoint or publish a verified tool list. See [MCP integration boundaries](./mcp) before registering any independently supplied service.
