# ApiFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; reference pages mirror the source package READMEs.

From the repository root:

```sh
npm --workspace @apifn/docs run dev
npm --workspace @apifn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @apifn/docs -- docsfn validate --root .
```
The site defaults to port 6020. Its dedicated documentation hosts are `dev-docs.apifn.dev` (dev) and `docs.apifn.dev` (live), under the owned `apifn.dev` zone. The application apex, `dev.apifn.dev`, and the existing landing Worker are not claimed. Keep the dev/live origin selected by the deployment and incoming request; do not hard-code the live canonical URL into development builds.

## Cloudflare deployment

`node scripts/cloudflare-docs/deploy.mjs dev --products=apifn --dry-run` builds and bundles locally without uploading a Worker or attaching a domain. The generated Wrangler configuration uploads **only** the Worker and provides its `ASSETS` binding. `.cloudflare-docs-domain.json` records the separate, approved Custom Domain publication plan. Do not add domain routes to the generated Wrangler configuration: non-interactive Wrangler domain publishing enables DNS/origin overrides.

A later authorized deployment without `--dry-run` requires `CLOUDFLARE_ACCOUNT_ID` to match the configured owner and an appropriately scoped `CLOUDFLARE_API_TOKEN`. Before upload and again before attachment, the deployment checks the active zone/account and complete DNS/domain/route/ruleset inventories. DNS inventories use numeric pages, Rulesets use opaque cursors, and Worker Domains/Routes and Page Rules return complete arrays without invented pagination parameters. Contradictory/truncated metadata, repeated inventory IDs or cursors, malformed rows and delegated docs-host NS records fail closed; the approved zone's apex NS records do not delegate the docs hostname. Conflicts abort rather than replacing records or taking over another service. Attachment requests disable scope, origin, and DNS overrides. If attachment fails after upload, the command fails and leaves the uploaded Worker in place; it does not delete or roll back infrastructure. These read snapshots are not a multi-resource transaction or a guarantee against all concurrent infrastructure changes.

After building with `CLOUDFLARE_DOCS_DEPLOY=1` and `CLOUDFLARE_DOCS_ASSETS_ORIGIN=https://dev-docs.apifn.dev` (or the live host), run `npm --workspace @apifn/docs run check:cloudflare -- dev` (or `live`). This bundles with Wrangler's real dry-run path and runs the generated artifact in local workerd, checking root queries, native data/search/LLM responses, asset origin/MIME/cache, missing paths, HEAD and native POST/CSRF behavior. It requires the repository's installed Wrangler dependency, not a global tool.

ApiFn Route-sync dispatch is intentionally a no-op: Custom Domains own every path on these docs-only hostnames, including root URLs with queries. Other products retain their path-specific Worker Routes. Actual deployment/domain attachment creates DNS/certificates and requires separate live authorization; a local dry-run does not prove public routing or credentials.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt`.
