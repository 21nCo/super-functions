---
title: Request snippets
description: Generate client request examples from operations.
---

# Request snippets

`@apifn/snippets` generates request code from an OpenAPI operation for curl, browser fetch, Axios, node-fetch, Python requests or httpx, Go, Ruby, PHP, C#, and Java.

```sh
npx apifn snippet .apifn/openapi.yml
```

The library accepts an operation, path, method, target, base URL, and optional auth values. Review generated snippets before sharing: tokens, sample bodies, and production base URLs may be embedded. See the [snippets reference](/docs/reference/snippets) for `generateSnippet`, `generateAllSnippets`, and the supported targets.
