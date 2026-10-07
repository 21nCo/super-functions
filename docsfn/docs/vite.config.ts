import path from "node:path";
import { sourceAliases } from "./source-aliases.mjs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const svelteSrc = path.resolve(dirname, "../svelte/src");

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: [
      ...Object.entries(sourceAliases).map(([find, replacement]) => ({ find, replacement })),
      { find: "@site/docs-content", replacement: path.join(svelteSrc, "DocsContent.svelte") },
      { find: "@site/docs-layout", replacement: path.join(svelteSrc, "DocsLayout.svelte") },
      { find: "@site/docs-site-shell", replacement: path.join(svelteSrc, "DocsSiteShell.svelte") },
      { find: "@site/topbar", replacement: path.join(svelteSrc, "TopBar.svelte") },
      { find: "@site/breadcrumbs", replacement: path.join(svelteSrc, "Breadcrumbs.svelte") },
      { find: "@site/pagination", replacement: path.join(svelteSrc, "Pagination.svelte") },
      { find: "@site/docs-sidebar", replacement: path.join(svelteSrc, "DocsSidebar.svelte") },
      { find: "@site/docs-toc", replacement: path.join(svelteSrc, "DocsToc.svelte") },
      { find: "@site/api-reference-renderer", replacement: path.join(svelteSrc, "ApiReferenceRenderer.svelte") },
      { find: "@site/docs-search", replacement: path.join(svelteSrc, "DocsSearch.svelte") },
      { find: "@site/page-actions", replacement: path.join(svelteSrc, "PageActions.svelte") },
      { find: "@site/dated-collection-list", replacement: path.join(svelteSrc, "DatedCollectionList.svelte") },
    ],
  },
});
