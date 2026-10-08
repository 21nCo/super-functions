---
title: llms.txt
description: The two generated FileFn documentation context files and their native docs routes.
---

# llms.txt

The site generates two text artifacts:

| Configured publication URL | Content |
| --- | --- |
| `https://filefn.com/docs/llms.txt` | Page outline and links. |
| `https://filefn.com/docs/llms-full.txt` | Full documentation context. |

These are configured URLs, not a claim of live deployment. Native prerendered `/docs/llms.txt` and `/docs/llms-full.txt` routes publish the artifacts; root-level static copies are not the advertised docs-owner URLs. There is no `llms-rich.json` generator or endpoint in this site.

## Generate and check

Prepare the repository-owned dependencies and build from the repository root:

```sh
npm exec -- turbo run build --filter=@filefn/docs
```

After prerequisites are built, from `filefn/docs`:

```sh
npm run generate:llms
npm run check:llms
```

The generator loads the consumer's published DocsFn configuration and filesystem provider, builds a manifest, and writes `static/llms.txt` and `static/llms-full.txt`. The FileFn generator selects non-draft `docs:` pages and builds both text artifacts using the configured canonical URL; Blog posts are not included. `check:llms` compares content without writing.

## Use as context

An assistant that supports URL retrieval can use the configured URLs above. If it cannot fetch them, supply a generated local file through that tool's supported context interface. Generated sizes vary with content; use the outline for smaller context budgets.

The default local port is 6006:

```text
http://localhost:6006/docs/llms.txt
http://localhost:6006/docs/llms-full.txt
```

Documentation context does not authenticate an assistant, grant access to your FileFn server, or create [MCP tools](./mcp).
