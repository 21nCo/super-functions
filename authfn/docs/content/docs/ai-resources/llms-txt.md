---
title: llms.txt
description: Static context files generated from the docs — drop into your assistant for one-shot RAG.
---

# llms.txt

[`llms.txt`](https://llmstxt.org/) is a community convention for static, LLM-friendly summaries of a project. authfn ships **two** files at the docs origin:

- `https://authfn.superfunctions.dev/llms.txt` — short index. Lists every doc page with a one-line description and a link.
- `https://authfn.superfunctions.dev/llms-full.txt` — full text. Concatenated markdown of every doc page plus the OpenAPI spec.

Use whichever fits your assistant's context budget.

## How they're generated

Both files are emitted by docsfn at build time:

```bash
npm run docs:llms     # writes static/llms.txt and static/llms-full.txt
```

The pipeline:

1. Walks every page in `content/docs/**`.
2. For each page, extracts the H1 + frontmatter description for `llms.txt`.
3. For each page, includes the full markdown body for `llms-full.txt`.
4. Appends the OpenAPI spec from `content/api/authfn.json` (operations + schemas).
5. Writes both files into `static/` so they ship with the deployed site.

## Use it

In Cursor, Claude Desktop, ChatGPT custom GPTs, or anything that accepts a URL as context:

```
https://authfn.superfunctions.dev/llms-full.txt
```

For local development against your own fork, you can also point at:

```
http://localhost:5173/llms.txt
http://localhost:5173/llms-full.txt
```

## What's in `llms-full.txt`

Roughly:

```text
# authfn — Self-hosted authentication for any stack

> Sessions, OTP, passwords, social OAuth, 2FA, API keys, multi-region...

## Welcome
[full body of index.md]

## Getting Started
[full body of getting-started.md]

## Core Concepts › Architecture
[full body of architecture.md]

...

## OpenAPI
- POST /sign-up/password — Create a new account with email and password.
- POST /sign-in/password — Sign in with email and password.
[...all 31 operations...]
```

## Customizing

The `docs:llms` task is configurable via `docsfn.config.ts`:

```ts
{
  // ...
  llmsTxt: {
    enabled: true,
    includeOpenApi: true,
    includePages: ['docs/**'],
    excludePages: ['docs/blog/**'],
  },
}
```

## Token budget

| File | Approximate size |
| --- | --- |
| `llms.txt` | ~8 KB (~2,000 tokens) |
| `llms-full.txt` | ~250 KB (~65,000 tokens) |

For models with smaller context windows, prefer `llms.txt` and use the [MCP server](./mcp) for on-demand retrieval.
