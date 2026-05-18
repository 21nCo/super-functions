import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const docsfnSvelteSrc = path.resolve(dirname, "../../node_modules/@docsfn/svelte/src");

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: [
      { find: "@site/docs-content", replacement: path.join(docsfnSvelteSrc, "DocsContent.svelte") },
      { find: "@site/docs-layout", replacement: path.join(docsfnSvelteSrc, "DocsLayout.svelte") },
      { find: "@site/topbar", replacement: path.join(docsfnSvelteSrc, "TopBar.svelte") },
      { find: "@site/breadcrumbs", replacement: path.join(docsfnSvelteSrc, "Breadcrumbs.svelte") },
      { find: "@site/pagination", replacement: path.join(docsfnSvelteSrc, "Pagination.svelte") },
      { find: "@site/docs-sidebar", replacement: path.join(docsfnSvelteSrc, "DocsSidebar.svelte") },
      { find: "@site/docs-toc", replacement: path.join(docsfnSvelteSrc, "DocsToc.svelte") },
      { find: "@site/api-reference-renderer", replacement: path.join(docsfnSvelteSrc, "ApiReferenceRenderer.svelte") },
      { find: "@site/docs-search", replacement: path.join(docsfnSvelteSrc, "DocsSearch.svelte") },
    ],
  },
});
