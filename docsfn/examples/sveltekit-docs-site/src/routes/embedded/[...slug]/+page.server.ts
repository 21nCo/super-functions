import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  const slug = params.slug ?? "";
  const normalizedSlug = slug.length > 0 ? slug : "index";

  const page = Object.values(source.manifest.pages).find((candidate) => {
    const candidateSlug = candidate.slug.length > 0 ? candidate.slug : "index";
    return candidateSlug === normalizedSlug;
  });

  if (!page) {
    throw error(404, `embedded page /embedded/${normalizedSlug} was not generated`);
  }

  return {
    page,
  };
};
