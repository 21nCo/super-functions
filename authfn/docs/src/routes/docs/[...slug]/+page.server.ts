import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getCompiledDocsPage, loadDocsSiteSource } from "$lib/server/docs-site-source";
import { loadDocsPage } from "../../../../../../scripts/docs-site/page";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const source = await loadDocsSiteSource();
  return loadDocsPage({ slug: params.slug, source, getCompiledDocsPage, resolveMarkdownRelativeLinks, options: { fallbackSidebarId: "docs" } });
};
