import { getCollectionPosts } from "@docsfn/sveltekit";
import { loadRequestDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ request }) => {
  const source = await loadRequestDocsSiteSource(request);

  return {
    posts: getCollectionPosts("blog", source.manifest),
  };
};
