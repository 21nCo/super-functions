---
title: Codex
description: Provide FileFn source and generated documentation context to coding agents.
---

# Codex

Give your agent the [short index or full context](./llms-txt) through its supported URL or file context interface. Prefer inspected installed versions and repository source over guessed APIs.

Suggested repository instructions:

```md
Use https://filefn.com/docs and the generated LLM context files for FileFn guidance.
Inspect the actual installed public exports before writing examples.
Preserve policy, tenant, quota, and authorization checks.
Run local tests before proposing changes; ask before operating live infrastructure.
```

The native `/docs/search.json` route is a search index, not a `?q=` query API or MCP service. This docs site has no `/docs/<slug>/raw`, `/mcp`, `/skills/`, `/api/filefn.json`, or `llms-rich.json` route contract. Do not register tool wrappers against invented endpoints. Any independent tool service must define and verify its own schema, authentication, authorization, and deployment.
