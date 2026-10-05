---
title: llms.txt
description: Static context files generated from the docs — drop into your assistant for one-shot RAG.
---

# llms.txt

[`llms.txt`](https://llmstxt.org/) is a convention for LLM-friendly project context. This docs site serves two generated files under its existing `/docs` mount:

- `https://authfn.com/docs/llms.txt` — short page index.
- `https://authfn.com/docs/llms-full.txt` — full documentation context, including the configured API material.

These are the configured publication URLs; a local build does not prove live hosting or credentials.

## Generation

The normal repository build prepares AuthFn's physical dependencies before regenerating OpenAPI and LLM content:

```sh
npm exec -- turbo run build --filter=@authfn/docs
```

After those prerequisites are built, run from `authfn/docs`:

```sh
npm run generate:openapi
npm run generate:llms
npm run check:llms
```

`generate:llms` loads `docsfn.config.ts` through the consumer's published DocsFn package and filesystem provider, builds the manifest, and writes `static/llms.txt` and `static/llms-full.txt`. Native prerendered routes publish those files at `/docs/llms.txt` and `/docs/llms-full.txt`; the app-root static copies are not the advertised docs-owner URLs. `check:llms` compares generated content without writing it.

## Use it

Supply the full-context URL to an assistant that accepts URLs:

```text
https://authfn.com/docs/llms-full.txt
```

The default local docs port is 6005:

```text
http://localhost:6005/docs/llms.txt
http://localhost:6005/docs/llms-full.txt
```

## Configuration and size

The manifest follows the configured content directories and `site.canonicalUrl` in `docsfn.config.ts`. The shared `scripts/docs-site/llms.mjs` builder passes the canonical URL and excludes Blog posts with the published `includeBlog:false` option. There is no consumer `docs:llms` script or invented `llmsTxt` configuration object.

Generated sizes vary with the corpus and API schema. Prefer the short index for smaller context budgets; retrieve individual linked pages or use the separately configured [MCP server](./mcp) when appropriate. Static context files do not authenticate an assistant or establish a live MCP connection.
