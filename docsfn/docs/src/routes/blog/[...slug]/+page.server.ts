import { resolveUnsafeHtmlAllowlist } from "@docsfn/core";
import { error } from "@sveltejs/kit";
import { getCollectionPostData } from "@docsfn/sveltekit";
import { getCompiledDocsPost, loadRequestDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, request }) => {
  const source = await loadRequestDocsSiteSource(request);
  const post = getCollectionPostData("blog", params.slug, source.manifest);

  if (!post || post.draft) {
    throw error(404, "Post not found");
  }

  const compiled = await getCompiledDocsPost(post.id, source);

  return {
    post,
    compiled,
    unsafeHtmlAllowlist: resolveUnsafeHtmlAllowlist({}),
    siteTitle: source.siteTitle,
  };
};
