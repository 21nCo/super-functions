import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getCompiledDocsPost, loadDocsSiteSource } from "$lib/server/docs-site-source";
import { loadBlogPost } from "../../../../../../scripts/docs-site/blog";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => loadBlogPost({
  slug: params.slug, source: await loadDocsSiteSource(), getCompiledDocsPost, resolveMarkdownRelativeLinks,
});
