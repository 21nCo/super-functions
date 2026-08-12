---
title: Codex
description: Wire filefn into OpenAI Codex / GPT-based agents — system prompt bundle, JSON schema, and tool wrappers.
---

# Codex

For agents based on OpenAI Codex / GPT (Codex CLI, ChatGPT custom GPTs, Continue.dev with GPT models):

## System prompt bundle

Drop `https://docs.filefn.dev/llms.txt` (lightweight) or `https://docs.filefn.dev/llms-full.txt` (full) into the agent's system prompt. The lightweight version is ~3 KiB and gives the agent enough scaffolding to know what's available; the full version is ~150 KiB and is suitable for agents that pre-cache context.

## Function tools

For agents that support function calling, register the filefn MCP tools. Most clients (Cursor, Continue, ChatGPT custom GPT) speak MCP natively; for ones that don't, write a thin wrapper:

```ts
const tools = [
  {
    type: "function",
    function: {
      name: "filefn_search_docs",
      description: "Search filefn documentation",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filefn_fetch_page",
      description: "Fetch a filefn docs page",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
      },
    },
  },
];

async function handleToolCall(name, args) {
  if (name === "filefn_search_docs") {
    return await fetch(`https://docs.filefn.dev/search.json?q=${encodeURIComponent(args.query)}&limit=${args.limit}`)
      .then((r) => r.json());
  }
  if (name === "filefn_fetch_page") {
    return await fetch(`https://docs.filefn.dev/docs/${args.slug}/raw`).then((r) => r.text());
  }
}
```

The kernel exposes `/search.json` and `/docs/<slug>/raw` for non-MCP consumers.

## ChatGPT custom GPT

In the GPT builder:

1. Knowledge → Upload `llms-full.txt`.
2. Actions → Import the OpenAPI from `https://docs.filefn.dev/api/filefn.json` (the docs site OpenAPI, not the filefn server's OpenAPI).
3. Instructions → "When the user asks about filefn, search the knowledge base or call the search_docs / fetch_page actions before answering."

## Continue.dev

`config.json`:

```json
{
  "mcpServers": [
    {
      "name": "filefn",
      "type": "http",
      "url": "https://docs.filefn.dev/mcp"
    }
  ]
}
```

## See also

- [MCP server](./mcp) — the canonical surface.
- [llms.txt](./llms-txt) — static alternative.
