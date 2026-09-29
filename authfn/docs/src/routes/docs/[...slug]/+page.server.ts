import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getCompiledDocsPage, loadDocsSiteSource } from "$lib/server/docs-site-source";
import { loadDocsPage } from "../../../../../../scripts/docs-site/page";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  return loadDocsPage({ slug: params.slug, source, getCompiledDocsPage, resolveMarkdownRelativeLinks });
};
