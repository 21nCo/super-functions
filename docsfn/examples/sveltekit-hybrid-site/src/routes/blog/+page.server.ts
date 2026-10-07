import type { PageServerLoad } from "./$types";
import { getDocsCollectionPosts } from "@docsfn/sveltekit";

export const load: PageServerLoad = async ({ parent }) => {
  const { source } = await parent();

  return {
    posts: getDocsCollectionPosts("blog", source.docs.manifest)
  };
};
