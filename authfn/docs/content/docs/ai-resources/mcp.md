---
title: MCP server
description: A Model Context Protocol server that exposes authfn docs, OpenAPI, and example apps as live tools for your assistant.
---

# MCP server

The authfn **MCP server** is a small Node process that wraps the docs as a set of tools. MCP-aware assistants (Claude Desktop, Cursor, custom hosts) connect to it once, then have on-demand access to:

- All doc pages, by slug or full-text search.
- The OpenAPI spec — operation lookup by id, route, or tag.
- Example apps — file listings, content reads.
- Skill packs — see [Skills](./skills).

## Install

The server is published as `@authfn/mcp`:

```bash
npm install -g @authfn/mcp
```

Or use `npx` (no install required):

```bash
npx @authfn/mcp --help
```

## Tools exposed

| Tool | Description |
| --- | --- |
| `authfn.docs.search` | Full-text search over the docs. Returns matched pages with snippets. |
| `authfn.docs.get` | Read a doc page by slug. |
| `authfn.docs.list` | List all doc pages. |
| `authfn.openapi.operation` | Look up an operation by id, route, or tag. |
| `authfn.openapi.schema` | Look up a schema definition. |
| `authfn.examples.list` | List example apps. |
| `authfn.examples.read` | Read a file from an example app. |
| `authfn.skills.list` | List available skill packs. |
| `authfn.skills.invoke` | Run a skill pack against the user's question. |

## Configure your assistant

### Claude Desktop

```jsonc
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "authfn": {
      "command": "npx",
      "args": ["-y", "@authfn/mcp"]
    }
  }
}
```

### Cursor

```jsonc
// .cursor/mcp.json (in your project)
{
  "mcpServers": {
    "authfn": {
      "command": "npx",
      "args": ["-y", "@authfn/mcp"]
    }
  }
}
```

### Custom host

The server speaks stdio MCP. Any MCP host can launch it as a child process:

```bash
npx -y @authfn/mcp
```

## Example session

```text
User: How do I add 2FA to a SvelteKit app?
Assistant (under the hood): authfn.docs.search("two factor sveltekit")
   → returns plugins/two-factor.md, recipes/adding-2fa.md, sdk/svelte.md
Assistant: First, install @authfn/core, @authfn/svelte and add the plugin:
  ...
```

## Why MCP and not just llms.txt?

`llms-full.txt` is great for quick context, but it's static. MCP is **on-demand** — the assistant only fetches what it needs. That means:

- Lower token usage on every turn.
- Always fresh — new releases / docs updates appear immediately if the server is running locally with `--watch`.
- Tools can return structured data (the OpenAPI operation object, the actual file content of an example) instead of just text.

## Watching local docs

If you're contributing to authfn:

```bash
cd authfn/docs
npx @authfn/mcp --watch
```

The server reloads its index when you save a doc page.

## Authentication

The server is read-only and exposes only public docs. No authentication is required. If you fork and want to gate it, the project at `authfn/mcp/` accepts an optional `--auth-token` flag that requires a `Bearer` token on every tool call.

## Related

- [llms.txt](./llms-txt) — static fallback.
- [Skills](./skills) — packaged patterns that run via the MCP server.
