import { error } from "@sveltejs/kit";
import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getPostData } from "@docsfn/sveltekit";
import { getCompiledDocsPost } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  const post = getPostData(params.slug, source.manifest);

  if (!post || post.draft) {
    throw error(404, "Post not found");
  }

  const compiled = resolveMarkdownRelativeLinks({
    compiled: await getCompiledDocsPost(post.id),
    route: `/blog/${post.slug}`,
    sourcePath: post.relativePath,
  });

  return {
    post,
    compiled,
    siteTitle: source.siteTitle,
  };
};
