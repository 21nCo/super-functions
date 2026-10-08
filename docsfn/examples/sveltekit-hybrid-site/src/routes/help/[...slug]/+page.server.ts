import { resolveUnsafeHtmlAllowlist } from "@docsfn/core";
import { error } from "@sveltejs/kit";
import { getStandalonePageByPath, loadHybridSiteSource } from "../../../lib/server/site-source";
import type { PageServerLoad } from "./$types";

export const entries = async () => Object.values((await loadHybridSiteSource()).docs.manifest.pages)
  .filter((page) => page.path === "/help" || page.path.startsWith("/help/"))
  .map((page) => ({ slug: page.path.slice("/help".length).replace(/^\//, "") }));

export const load: PageServerLoad = async ({ params }) => {
  const source = await loadHybridSiteSource();
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : params.slug;
  const routePath = `/help/${slug ?? ""}`.replace(/\/+$/, "");
  const page = getStandalonePageByPath(source.docs.manifest, routePath);

  if (!page) {
    throw error(404, `standalone page ${routePath} was not generated`);
  }

  return {
    page,
    compatPreset: source.docs.compatPreset,
    unsafeHtmlAllowlist: resolveUnsafeHtmlAllowlist({})
  };
};
