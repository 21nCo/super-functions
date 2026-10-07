import { error } from "@sveltejs/kit";
import { compileSvelteContent, resolveMarkdownRelativeLinks } from "@docsfn/core";
import { getDocsCollectionPosts, getPostDataOrThrow } from "@docsfn/sveltekit";
import { loadHybridSiteSource } from "../../../lib/server/site-source";
import type { PageServerLoad } from "./$types";

export const entries = async () => getDocsCollectionPosts(
  "blog", (await loadHybridSiteSource()).docs.manifest
).map((post) => ({ slug: post.slug }));

function isRouteNotFoundError(input: unknown): input is { message: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    "code" in input &&
    String((input as { code: unknown }).code) === "DOCS_ROUTE_NOT_FOUND"
  );
}

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();

  try {
    const post = getPostDataOrThrow(params.slug, source.docs.manifest);
    const sourcePath = post.id.replace(/^blog:/, "");
    return {
      post,
      compiled: resolveMarkdownRelativeLinks({
        compiled: compileSvelteContent({ source: post.body, sourcePath, compatPreset: source.docs.compatPreset }),
        route: post.path, sourcePath,
      }),
      compatPreset: source.docs.compatPreset
    };
  } catch (routeError) {
    if (isRouteNotFoundError(routeError)) {
      throw error(404, routeError.message);
    }
    throw routeError;
  }
};
