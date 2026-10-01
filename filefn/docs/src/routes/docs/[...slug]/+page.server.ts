import { loadDocsPage } from "../../../../../../scripts/docs-site/page";
import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getCompiledDocsPage } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  return loadDocsPage({ slug: params.slug, source, getCompiledDocsPage, resolveMarkdownRelativeLinks, options: { fallbackSidebarId: "docs" } });
};
