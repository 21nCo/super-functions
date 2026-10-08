import { resolveUnsafeHtmlAllowlist } from "@docsfn/core";
import { error } from "@sveltejs/kit";
import { getCollectionPostData, resolveEmbedMode } from "@docsfn/sveltekit";
import { getCompiledDocsPost, loadRequestDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, request, url }) => {
  const source = await loadRequestDocsSiteSource(request);
  const post = getCollectionPostData("changelog", params.slug, source.manifest);

  if (!post || post.draft) {
    throw error(404, "Changelog entry not found");
  }

  const compiled = await getCompiledDocsPost(post.id, source);

  return {
    embed: resolveEmbedMode(url),
    collection: source.manifest.collections?.changelog,
    post,
    compiled,
    unsafeHtmlAllowlist: resolveUnsafeHtmlAllowlist({}),
    siteTitle: source.siteTitle,
  };
};
