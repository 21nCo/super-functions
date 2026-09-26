# Shared DocsFn site runtime

The new per-function sites supply their config and Vite raw-content globs to `createDocsSiteRuntime`. Each factory call owns its own manifest/search/compiled-content cache. Keep this module server-only; layout loaders return only site/navigation metadata, and search is loaded from `/docs/search.json` when needed.

`Search.svelte` uses DocsFn's search runtime with a native modal dialog. It supports the visible trigger, Ctrl/Cmd+K, Escape, keyboard-focusable result links, loading state, and errors without the published UI dialog's SSR limitation.

Each site resolves the shared module's DocsFn imports through its own Vite aliases so it uses the versions pinned by that site. Run `npm run build` in the affected `<function>/docs` directory. After changing shared code, build all consumers and verify desktop search (including a result navigation and Escape) plus the mobile Menu drawer. Keep the responsive open-drawer override when using the current published theme.

The new-site PRs carry identical copies of this shared directory so they can land independently. Once merged, edits belong here rather than in the small per-site factory wrappers.

AuthFn and FileFn currently retain their existing runtime copies; edits here affect only sites whose factory wrappers import this directory. Migrate those consumers in their respective PRs before treating this as the runtime for every SvelteKit docs site.
