import { error } from "@sveltejs/kit";
import { compileSvelteContent, resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getDocsBlogPostData } from "@docsfn/sveltekit";
import type { PageServerLoad } from "./$types";
import {
  loadDocsSiteSource,
  type DocsSiteSource,
} from "../../../lib/server/docs-site-source";

export const prerender = false;

export const load: PageServerLoad = async ({ params, parent }) => {
  const parentData = await parent();
  const source =
    "source" in parentData
      ? (parentData.source as DocsSiteSource)
      : await loadDocsSiteSource();
  const post = getDocsBlogPostData(params.slug, source.manifest);

  if (!post) {
    throw error(404, `blog route /blog/${params.slug} was not generated`);
  }

  return {
    post,
    compiled: resolveMarkdownRelativeLinks({
      compiled: compileSvelteContent({
        source: post.body, sourcePath: post.id.replace(/^blog:/, ""), compatPreset: source.compatPreset,
      }),
      route: post.path, sourcePath: post.id.replace(/^blog:/, ""),
    }),
    compatPreset: source.compatPreset,
  };
};
