# Shared DocsFn site runtime

The new per-function sites supply their config and Vite raw-content globs to `createDocsSiteRuntime`. Each factory call owns its own manifest/search/compiled-content cache. Keep this module server-only; layout loaders return only site/navigation metadata, and search is loaded from `/docs/search.json` when needed.

`Search.svelte` uses DocsFn's search runtime with a native modal dialog. It supports the visible trigger, Ctrl/Cmd+K, Escape, keyboard-focusable result links, loading state, and errors without the published UI dialog's SSR limitation.

Each site resolves the shared module's DocsFn imports through the scoped Vite resolver so it uses the versions pinned by that site. Run `npm run build` in the affected `<function>/docs` directory. After changing shared code, build all consumers and verify desktop search (including a result navigation and Escape) plus the mobile Menu drawer. Keep the responsive open-drawer override when using the current published theme.

Each new-site PR includes this shared directory at the same repository path so it can land independently. All factory wrappers reference this one canonical directory. After merge, edit it directly rather than duplicating provider logic in individual sites.

Only sites whose factory wrappers import this directory consume this runtime. Check those imports when planning cross-site validation.

Bundled files have no reliable filesystem modification time; the provider omits `updatedAt` instead of inventing one. YAML frontmatter uses the same gray-matter parser as the filesystem provider. Binary static files stay in SvelteKit’s static passthrough; factory wrappers import only `*.{txt,json,md}` as raw text. Consolidated consumers declare `gray-matter` directly, and shared dependency imports resolve through the consuming workspace's export conditions/framework plugins.

Run `npm test` in a new-site workspace to check generated LLM files and the shared provider/cache contracts. Initialization failures are retryable; concurrent successful requests reuse one cache. The shared Vitest config accepts an explicit `DOCS_SITE_DIR`, npm's consumer manifest, or a valid consumer cwd before resolving dependencies. Enabled search tests use the same repository peer source aliases as production builds.

LLM generation anchors both the provider and effective config root to the consumer directory. Deployment producers set `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` independently of `CLOUDFLARE_DOCS_ASSETS_ORIGIN`; generators only consume the public override in deployment mode. Undeployed MailFn indexes retain GitHub source links (default ref `dev`). For PR previews or version-pinned source links, set `DOCS_SOURCE_REF` to the branch or commit when generating (for example `DOCS_SOURCE_REF=codex/docs-mailfn-20260926 npm run generate:llms --workspace @mailfn/docs`). Ref segments and filenames are URL encoded. This fallback is a source index, not a claim that a live canonical site is serving.
