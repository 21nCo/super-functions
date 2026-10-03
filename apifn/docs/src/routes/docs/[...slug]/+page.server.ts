import { loadDocsPage } from "../../../../../../scripts/docs-site/page";
import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getCompiledDocsPage, loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const result = await loadDocsPage({
    slug: params.slug,
    source: await loadDocsSiteSource(),
    getCompiledDocsPage,
    resolveMarkdownRelativeLinks,
    options: {
      apiBreadcrumbLabel: "Package reference",
      apiBreadcrumbHref: "/docs/reference",
      fallbackSidebarId: "docs",
    },
  });
  return {
    routeEntry: result.routeEntry.kind === "page" ? { kind: "page" as const } : result.routeEntry,
    surface: result.surface,
    sidebar: result.sidebar,
    compiled: result.compiled,
    siteTitle: result.siteTitle,
  };
};
