import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  const post = Object.values(source.manifest.posts).find(
    (candidate) => candidate.slug === params.slug
  );

  if (!post) {
    throw error(404, `blog route /blog/${params.slug} was not generated`);
  }

  return {
    post,
  };
};
