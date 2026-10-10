---
title: MCP integration boundaries
description: The current FileFn docs site does not implement an MCP server.
---

# MCP integration boundaries

This FileFn docs site does not implement a `/mcp` endpoint. It does not publish `search_docs`, `fetch_page`, `get_route`, `get_error`, or executable skill tools. Changing a hostname in an editor configuration would not create those services.

Use the generated [LLM context files](./llms-txt) or native documentation pages instead. The native `/docs/search.json` route supplies a search index, not a ready-made MCP tool protocol.

If your application provides a separate MCP service, use that application's verified endpoint and tool schema. Its operator owns authentication, authorization, request limits, data exposure, and deployment. Do not assume public documentation content authorizes tools to access or mutate your FileFn data.
