---
title: AI Resources
description: Use filefn from your AI coding assistant — llms.txt, MCP server, Skills, and editor configurations.
---

# AI Resources

filefn ships first-class support for AI coding assistants. The same documentation you read here is mirrored as machine-readable surfaces.

| Surface | Use it from | Best for |
| --- | --- | --- |
| [llms.txt](./llms-txt) | Anywhere | Auto-included context in tools that read llms.txt. |
| [llms-full.txt](./llms-txt) | Anywhere | The whole site as a single text file. |
| [MCP server](./mcp) | MCP-aware clients (Claude Desktop, Cursor, etc.) | Live search + page fetch. |
| [Skills](./skills) | Skill-aware assistants | Pre-baked workflows (set up filefn, add a processor, debug a stuck upload). |
| [Cursor](./cursor) | Cursor IDE | Project-level rules + skills. |
| [Claude](./claude) | Claude Code / Claude Desktop | CLAUDE.md hints + MCP wiring. |
| [Codex](./codex) | OpenAI Codex / GPT-based agents | system-prompt friendly bundle. |

## Why?

filefn's surface is wide: 24 routes, 27 operations, a dozen configuration knobs, eight bundled processors, six storage adapters, and language SDKs in JS, Python, and Swift. AI assistants help users navigate it without reading every page.

When you wire filefn into your AI tool of choice, the tool can:

- answer "how do I make this S3 bucket use a CDN?" without you opening a docs tab.
- generate a custom processor matching your style with up-to-date type signatures.
- detect when your error code (e.g. `FILEFN_POLICY_MAX_SIZE_EXCEEDED`) is hit and suggest the relevant fix.
- run pre-baked workflows ("install filefn into my Hono app", "add HEIC support") without you knowing the route map.

## See also

- [Reference](../reference) — the same content the AI surfaces consume.
