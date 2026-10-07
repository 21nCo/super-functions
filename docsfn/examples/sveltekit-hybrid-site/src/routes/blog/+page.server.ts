import { loadHybridSiteSource } from "../../lib/server/site-source";
import type { PageServerLoad } from "./$types";
import { getDocsCollectionPosts } from "@docsfn/sveltekit";

export const load: PageServerLoad = async () => {
  const source = await loadHybridSiteSource();

  return {
    posts: getDocsCollectionPosts("blog", source.docs.manifest)
  };
};
