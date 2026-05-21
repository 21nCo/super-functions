---
title: AI Resources
description: First-class integrations for LLM-based coding assistants — llms.txt, an MCP server, and per-tool skill packs.
---

# AI Resources

authfn ships with **first-class AI assistant support** so the LLM in your editor can answer questions, generate idiomatic code, and apply correct patterns.

These integrations are powered by [docsfn](https://github.com/21nCo/super-functions/tree/dev/docsfn) — the same engine that builds this documentation site — so every doc page is automatically available to your assistant.

## What's available

| Resource | Use it when… |
| --- | --- |
| [llms.txt](./llms-txt) | You want a single-file context dump for Cursor / Claude / Codex / GPTs / etc. |
| [MCP server](./mcp) | You're using an MCP-aware assistant (Claude Desktop, Cursor with MCP, custom hosts) and want live retrieval. |
| [Skills](./skills) | You want to teach an assistant a specific authfn pattern (sign-in flow, social OAuth, multi-region, …). |
| [Cursor](./cursor) | You're on Cursor and want one-click setup. |
| [Claude](./claude) | You're on Claude Desktop / Claude Code and want one-click setup. |
| [Codex / Droid](./codex) | You're on Factory Codex / Droid (or any AGENTS.md-aware tool). |

## How they fit together

```mermaid
flowchart TD
    Docs[Docs source\n(content/docs/**)]
    OpenAPI[OpenAPI spec\n(content/api/authfn.json)]
    Examples[Example apps\n(authfn/examples)]

    Docs --> LlmsTxt[llms.txt + llms-full.txt]
    OpenAPI --> LlmsTxt
    Examples --> LlmsTxt

    Docs --> MCP[MCP server]
    OpenAPI --> MCP
    Examples --> MCP

    Docs --> Skills[Skill packs]

    LlmsTxt --> Editor[Editor / Assistant]
    MCP --> Editor
    Skills --> Editor
```

The same content powers all three surfaces; each is the right shape for a different consumer.

## Quick start

The fastest way to get going is to point your assistant at the canonical URL:

```
https://authfn.superfunctions.dev/llms-full.txt
```

Most assistants will accept that as a context source. If your tool is MCP-aware, see [MCP](./mcp) for a richer experience that surfaces type definitions, route metadata, and example apps on demand.
