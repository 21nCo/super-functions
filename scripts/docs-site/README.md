# Shared DocsFn site runtime

The new per-function sites supply their config and Vite raw-content globs to `createDocsSiteRuntime`. Each factory call owns its own manifest/search/compiled-content cache. Keep this module server-only; layout loaders return only site/navigation metadata, and search is loaded from `/docs/search.json` when needed.

APIFn's `Search.svelte` uses DocsFn's search runtime with a native modal dialog. It supports the visible trigger, Ctrl/Cmd+K, Escape, keyboard-focusable result links, loading state, and errors without the published UI dialog's SSR limitation.

Each site resolves the shared module's DocsFn imports through the scoped Vite resolver so it uses the versions pinned by that site. Run `npm run build` in the affected `<function>/docs` directory. After changing shared code, build all consumers and verify desktop search (including a result navigation and Escape) plus the mobile Menu drawer. Keep the responsive open-drawer override when using the current published theme.

Each new-site PR includes this shared directory at the same repository path so it can land independently. All factory wrappers reference this one canonical directory. After merge, edit it directly rather than duplicating provider logic in individual sites.

Only sites whose factory wrappers import this directory consume this runtime. Check those imports when planning cross-site validation.

Bundled files have no reliable filesystem modification time; the provider omits `updatedAt` instead of inventing one. YAML frontmatter uses the same gray-matter parser as the filesystem provider. Binary static files stay in SvelteKit’s static passthrough.

AuthFn/FileFn retain their existing published search wrappers, now targeting `/docs/search.json` so the configured `/docs*` Worker route forwards the artifact too. Their current layouts comment out TopBar; preserve that branch-specific choice rather than claiming active interactive search or enabling it implicitly. Their `/search.json` GET remains a compatibility alias; this does not extend the Worker's root ownership. All three asset globs include TXT/JSON/YAML/YML/MD/MDX as raw metadata inputs, excluding binary static files.

After building, run `node ../../scripts/docs-site/check-built-site.mjs` from each consuming docs workspace to check actual server responses, one title (including 404s), child title overrides and the mounted search artifact. Root-alias checks are separate from live Worker verification.

Run `npm test` from each consuming docs workspace to check generated LLM files and the shared provider/cache/page/resolution contracts. Do not run the shared configuration from the repository root: it requires a declared consumer dependency owner. Use Node 20.17+, 22.9+, or 24+ and npm 11 for the pinned Vitest 4.1.11 tooling (npm 10 can fail while resolving its optional peers). Vite 6 and Svelte plugin 5 are paired in these workspaces. Initialization failures are retryable; concurrent successful requests reuse one cache.

Published `DocPage` IDs contain `collection:relative/path.md`; `sourcePath` and `relativePath` are provider fields, not page fields. The shared loader strips only the first collection prefix before resolving links. Source index status, not the presence of child routes, determines the link base. Page payloads retain the lean kind discriminator; API records remain available to the renderer. Each consuming layout supplies a default document title (including 404s); child page titles override it through Svelte's head handling. Do not add a second static title to `app.html`.
