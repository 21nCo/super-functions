---
title: MCP availability
description: Current machine-readable FileFn docs and MCP endpoint status.
---

# MCP availability

This DocsFn site does not expose an MCP server or `/mcp` route. Do not register the retired `docs.filefn.dev/mcp` address in an assistant.

For machine-readable documentation, use [llms.txt](./llms-txt) or the [search index](/docs/search.json). To build an MCP integration, host an MCP server separately and point its tools at these resources; the docs site does not supply search or fetch MCP tools itself.
