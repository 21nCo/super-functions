import { getCollectionPosts, resolveEmbedMode } from "@docsfn/sveltekit";
import { loadRequestDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ request, url }) => {
  const source = await loadRequestDocsSiteSource(request);

  return {
    embed: resolveEmbedMode(url),
    collection: source.manifest.collections?.changelog,
    posts: getCollectionPosts("changelog", source.manifest),
  };
};
