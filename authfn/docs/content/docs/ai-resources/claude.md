---
title: Claude
description: One-click Claude Desktop / Claude Code setup for authfn.
---

# Claude

## Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%AppData%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "authfn": {
      "command": "npx",
      "args": ["-y", "@authfn/mcp"]
    }
  }
}
```

Restart Claude Desktop. Type `/` and you'll see the authfn tools.

Claude will pick up the MCP server automatically and answer questions about authfn with up-to-date docs and OpenAPI awareness.

## Claude Code

Claude Code reads MCP from a project-local file. From your project root:

```jsonc
// .claude/mcp.json
{
  "mcpServers": {
    "authfn": {
      "command": "npx",
      "args": ["-y", "@authfn/mcp"]
    }
  }
}
```

## Adding context

If you want Claude to *always* know what stack you're on, add a project-level CLAUDE.md:

```markdown
# Project

This is a SvelteKit app using:
- @authfn/core for the auth kernel (mounted at /auth)
- @authfn/client + @authfn/svelte for the browser
- Postgres + Drizzle for the database

When you need to know how something in @authfn/* works, use the `authfn.*` MCP tools.
For migration questions, invoke the appropriate `authfn.skills.*` skill.
```

## llms.txt fallback

For one-off conversations, paste this into a Claude prompt:

```text
Reference docs: https://authfn.superfunctions.dev/llms-full.txt

Now help me…
```

Claude will fetch and use the file as context.

## Related

- [MCP](./mcp)
- [Skills](./skills)
