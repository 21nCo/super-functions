---
title: llms.txt
description: The static AI surfaces — llms.txt, llms-full.txt, llms-rich.json — generated on every docs build.
---

# llms.txt

filefn publishes three machine-readable surfaces alongside the docs site:

| URL | Format | Use |
| --- | --- | --- |
| `/llms.txt` | Plain text outline | Lightweight context drop-in for any LLM. |
| `/llms-full.txt` | Full plain text | The entire docs as one file. ~150 KiB. |
| `/llms-rich.json` | Structured JSON | Pages with route maps, error codes, type signatures. |

These are generated automatically by `scripts/generate-llms.mjs` on every docs build (`npm run generate:llms` or `npm run build`).

## Format

`llms.txt` follows the [llmstxt.org](https://llmstxt.org/) specification. A short version:

```
# filefn

> File uploads, downloads, processing, and previews — for any stack.

## Docs

- [Welcome](https://docs.filefn.dev/docs): Overview and capability matrix.
- [Getting started](https://docs.filefn.dev/docs/getting-started): 9-step walkthrough.
- [Quickstart](https://docs.filefn.dev/docs/quickstart): Framework-specific.
- [Core Concepts](https://docs.filefn.dev/docs/core-concepts): Architecture.
- [Features](https://docs.filefn.dev/docs/features): Bundled features.
- [SDKs](https://docs.filefn.dev/docs/sdk): Server, client, Python, Swift.
- [Adapters](https://docs.filefn.dev/docs/adapters): Storage and DB.
- [Frameworks](https://docs.filefn.dev/docs/frameworks): Production wiring.
- [Recipes](https://docs.filefn.dev/docs/recipes): Production patterns.
- [Examples](https://docs.filefn.dev/docs/examples): Reference apps.
- [Reference](https://docs.filefn.dev/docs/reference): Routes, errors, events, schema.

## Optional

- [llms-full.txt](https://docs.filefn.dev/llms-full.txt): The whole site.
- [OpenAPI](https://docs.filefn.dev/api/filefn.json): Annotated spec.
- [MCP](https://docs.filefn.dev/docs/ai-resources/mcp): Live search + fetch.
```

## Use it from any tool

Most LLM clients accept arbitrary text context. Drop `llms.txt` into your project's prompt:

```bash
curl https://docs.filefn.dev/llms.txt > .ai/filefn-llms.txt
# include .ai/filefn-llms.txt in your assistant's system prompt
```

For tools that read `llms.txt` directly (Cursor, certain MCP servers), they'll discover it via the well-known URL.

## llms-full.txt

When the outline isn't enough — e.g. you want the full route reference and the entire processor catalog inline — use `llms-full.txt`. It's a single document containing every docs page, in IA order.

## llms-rich.json

Structured JSON for tools that want metadata (route HTTP methods, error code groups, page tags). Schema:

```jsonc
{
  "site": { "name": "filefn", "tagline": "...", "version": "..." },
  "pages": [
    {
      "slug": "core-concepts/upload-sessions",
      "title": "Upload sessions",
      "description": "...",
      "tags": ["multipart", "uploads", "lifecycle"],
      "url": "https://docs.filefn.dev/docs/core-concepts/upload-sessions",
      "body": "..."
    }
  ],
  "routes": [
    { "method": "POST", "path": "/upload/init", "description": "..." }
  ],
  "errors": [
    { "code": "FILEFN_POLICY_NOT_FOUND", "status": 404, "description": "..." }
  ]
}
```

## See also

- [MCP server](./mcp) — live alternative.
- [Reference](../reference) — the same content, formatted for humans.
