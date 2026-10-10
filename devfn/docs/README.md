# DevFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; reference pages mirror existing configuration, security, migration, and package Markdown guides.

From the repository root:

```sh
npm exec -- turbo run build --filter=@devfn/docs
npm --workspace @devfn/docs run dev
```

The filtered Turbo build prepares declared workspace dependency exports before building the site and regenerating `static/llms.txt` and `static/llms-full.txt`. Vite and CLI consumers use those public exports, not SearchFn source aliases. After that build, validate the site:

```sh
npm exec --workspace @devfn/docs -- docsfn validate --root .
```
The site defaults to port 6017. The public documentation route is `/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt`.
