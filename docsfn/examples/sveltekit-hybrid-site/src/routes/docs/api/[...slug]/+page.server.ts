import { generateStaticParams, loadApiData } from "@docsfn/sveltekit";
import { loadHybridSiteSource } from "../../../../lib/server/site-source";
import type { PageServerLoad } from "./$types";

export const entries = async () => generateStaticParams(
  (await loadHybridSiteSource()).docs.manifest, { basePath: "/docs/api" }
).map(({ slug }) => ({ slug: slug ?? "" }));

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();
  const api = loadApiData(params.slug, source.docs.manifest, {
    basePath: source.docs.basePath
  });

  return {
    api,
    apiLinks: Object.values(source.docs.manifest.apis)
      .sort((left, right) => left.path.localeCompare(right.path, "en"))
      .map((entry) => ({
        title: entry.title,
        path: entry.path
      }))
  };
};
