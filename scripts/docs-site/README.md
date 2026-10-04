# Shared DocsFn site runtime

The new per-function sites supply their config and Vite raw-content globs to `createDocsSiteRuntime`. Each factory call owns its own manifest/search/compiled-content cache. Keep this module server-only; layout loaders return only site/navigation metadata, and search is loaded from `/docs/search.json` when needed.

`Search.svelte` uses DocsFn's search runtime with a native modal dialog. It supports the visible trigger, Ctrl/Cmd+K, Escape, keyboard-focusable result links, loading state, and errors without the published UI dialog's SSR limitation.

Published `DocPage` has neither `sourcePath` nor `relativePath`: the loader derives source identity from the first-colon ID suffix. An index file's relative-link base must not depend on whether its route has children. Ordinary pages return only `{ kind: "page" }` beside compiled data; API entries retain their renderer data. AuthFn explicitly opts into its docs sidebar fallback.

Each site resolves declared core/subpaths, Kit, parser and test-tool imports through consumer-owned Vite conditions, without replacing imports made by dependencies. Run `npm run build` in the affected `<function>/docs` directory. After changing shared code, build all consumers and verify desktop search (including a result navigation and Escape) plus the mobile Menu drawer. Keep the responsive open-drawer override when using the current published theme.

Each new-site PR includes this shared directory at the same repository path so it can land independently. All factory wrappers reference this one canonical directory. After merge, edit it directly rather than duplicating provider logic in individual sites.

Only sites whose factory wrappers import this directory consume this runtime. Check those imports when planning cross-site validation.

Bundled files have no reliable filesystem modification time; the provider omits `updatedAt` instead of inventing one. YAML frontmatter uses the same gray-matter parser as the filesystem provider. Binary static files stay in SvelteKit’s static passthrough.

Use the text glob `../../../static/**/*.{txt,json,yaml,yml,md,mdx}` for bundled asset inputs; binary passthrough is separate. FileFn's mounted search endpoint retains `/search.json` as an alias. AuthFn has an active native search trigger; FileFn's commented-out TopBar must not be activated as a verification workaround.

Run `npm test` in an affected workspace to check generated LLM files without writing and the shared provider/cache/page/consumer contracts. After a production build, run `node ../../scripts/docs-site/check-built-site.mjs` from the consumer for native SSR titles/404/child/search checks. These checks do not prove live Worker deployment or clear hosted CI. Initialization failures are retryable; concurrent successful requests reuse one cache.
