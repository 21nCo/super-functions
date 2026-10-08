# ExtFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; detailed reference pages mirror the existing Markdown guides in this directory to preserve repository links. Keep both copies aligned when changing an ExtFn contract.

Prepare repository-owned dependencies and build from the repository root:

```sh
npm exec -- turbo run build --filter=@extfn/docs
```

The site resolves its declared public SearchFn/DocsFn dependencies. It does not substitute SearchFn workspace source aliases or prepare missing public `dist` exports during an ordinary direct Vite invocation.

After prerequisites are prepared, run from the repository root:

```sh
npm --workspace @extfn/docs run dev
npm --workspace @extfn/docs run generate:llms
npm --workspace @extfn/docs run check:llms
npm exec --workspace @extfn/docs -- docsfn validate --root .
```

The native build regenerates `static/llms.txt` and `static/llms-full.txt`. The site defaults to port 6015; documentation and the native LLM-resource routes live under `/docs`.

Public-origin configuration is applied only when `CLOUDFLARE_DOCS_DEPLOY=1`. `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` names the public receiver independently of `CLOUDFLARE_DOCS_ASSETS_ORIGIN`. A successful local build does not prove live Worker execution, domain readiness, extension behavior, or store approval.
