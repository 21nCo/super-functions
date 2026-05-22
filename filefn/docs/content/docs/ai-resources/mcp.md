---
title: MCP server
description: Connect AI assistants to live filefn docs via the Model Context Protocol — search, fetch, and reference.
---

# MCP server

filefn ships an MCP server that exposes the docs site as live tools. Clients see:

| Tool | Purpose |
| --- | --- |
| `search_docs` | Full-text search; returns matching pages with snippets. |
| `fetch_page` | Fetch a single page's full content by slug. |
| `list_pages` | Enumerate the docs IA. |
| `get_route` | Look up an HTTP route by `path` + `method`. |
| `get_error` | Look up an error by code. |
| `get_event` | Look up an event by name. |

## Installing

```bash
droid mcp add filefn https://docs.filefn.dev/mcp --type http
```

That registers the MCP server with Droid and similar MCP-aware clients.

For Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

For Cursor (`.cursor/mcp.json`):

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

## Self-hosting

The MCP server is part of the docs site. To run it under your own domain:

```bash
git clone https://github.com/21nco/super-functions.git
cd super-functions/filefn/docs
npm install
npm run build
npm run start
```

The server is available at `https://your-domain/mcp`. Behind it is the same content as `llms-full.txt` plus the structured `llms-rich.json` index.

## Tool details

### `search_docs`

```jsonc
{
  "name": "search_docs",
  "description": "Full-text search filefn documentation",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "limit": { "type": "integer", "default": 10 }
    },
    "required": ["query"]
  }
}
```

Returns top matches with title, snippet, slug.

### `fetch_page`

```jsonc
{
  "name": "fetch_page",
  "description": "Fetch a single docs page by slug",
  "input_schema": {
    "type": "object",
    "properties": {
      "slug": { "type": "string" }
    },
    "required": ["slug"]
  }
}
```

Returns the full markdown.

### `get_route`

```jsonc
{
  "name": "get_route",
  "description": "Look up an HTTP route by method + path",
  "input_schema": {
    "type": "object",
    "properties": {
      "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"] },
      "path": { "type": "string" }
    },
    "required": ["method", "path"]
  }
}
```

Returns the route's request schema, response schema, error codes, and a link to the docs page.

### `get_error`

```jsonc
{
  "name": "get_error",
  "description": "Look up an error code",
  "input_schema": {
    "type": "object",
    "properties": {
      "code": { "type": "string" }
    },
    "required": ["code"]
  }
}
```

Returns the canonical message, HTTP status, and "common causes" / "fixes" prose.

## See also

- [llms.txt](./llms-txt) — static alternative.
- [Skills](./skills) — pre-baked workflows.
