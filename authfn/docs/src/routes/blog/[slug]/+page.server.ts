import { error } from "@sveltejs/kit";
import { resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getPostData } from "@docsfn/sveltekit";
import { getCompiledDocsPost, loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const source = await loadDocsSiteSource();
  const post = getPostData(params.slug, source.manifest);

  if (!post || post.draft) {
    throw error(404, "Post not found");
  }

  const compiled = resolveMarkdownRelativeLinks({
    compiled: await getCompiledDocsPost(post.id),
    route: `/blog/${post.slug}`,
    sourcePath: post.id.replace(/^blog:/, ""),
  });

  return {
    post: { id: post.id, title: post.title, date: post.date, summary: post.summary, excerpt: post.excerpt, author: post.author, tags: post.tags },
    compiled,
    siteTitle: source.siteTitle,
  };
};
