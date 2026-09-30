# AuthFn documentation site

From the repository root, install workspace dependencies, then build the SearchFn dependencies used by DocsFn tooling:

```sh
npm run build --workspace @searchfn/core --workspace @searchfn/adapter-contracts --workspace @searchfn/adapter-memory --workspace @searchfn/adapter-indexeddb --workspace @searchfn/client
npm --workspace @authfn/docs run dev
npm --workspace @authfn/docs run build
npm --workspace @authfn/docs test
npm exec --workspace @authfn/docs -- docsfn validate --root .
```

The build regenerates OpenAPI and LLM resources before compiling the site. The public documentation URL is `https://authfn.com/docs`. The server runtime and landing-page presentation live in `scripts/docs-site`; keep per-site content and configuration here.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt`.
