---
title: "@docsfn/svelte"
description: Svelte 5 UI components for docsfn documentation sites.
---

# @docsfn/svelte

Shipped components wrap **`@uifn/svelte`** primitives (dialogs, tabs, scroll areas) and expect a resolved **`DocsPageSurface`** (or explicit props) from your layout loader.

```bash
npm install @docsfn/svelte
```

## Package exports

Default exports (Svelte files) are re-exported from the package entry — for Vite client bundles, prefer **direct `.svelte` file imports** or **`@site/*` aliases** (see [SvelteKit guide](../../guides/sveltekit)).

## Component index

Detailed props: **[Components](./components)**.

| Component | Summary |
| --- | --- |
| **DocsLayout** | Shell with sidebar column, main slot, TOC column; **`topbar`** slot. |
| **DocsContent** | Renders **`CompiledContentArtifact`** or compiles raw Markdown. |
| **DocsSidebar** | Recursive sidebar from **`Sidebar`**. |
| **SidebarGroup** | Single **`SidebarItem`** renderer (link / group / separator). |
| **DocsToc** | Heading list + optional **IntersectionObserver** active tracking. |
| **DocsSearch** | Dialog search UI, Cmd/Ctrl+K. |
| **TopBar** | Header nav + action slots. |
| **Pagination** | Prev/next + Alt+Arrow shortcuts. |
| **Breadcrumbs** | Trail with optional custom separator component. |
| **VersionSwitcher** | Dropdown for **`manifest.versions`**. |
| **EmbeddedPage** | Compact article + optional mini TOC. |
| **ApiReferenceRenderer** | OpenAPI reference layout. |

### Embedded article route context

Pass `route` as the actual URL hosting the embedded article, which can differ from its canonical docs URL. Pass the original source identity as Svelte `sourcePath` (React `page.id`) so index-page links resolve correctly. React uses `page.path` only as a fallback when `route` is omitted. For raw Markdown, these values let EmbeddedPage compile and resolve relative links before rendering.
