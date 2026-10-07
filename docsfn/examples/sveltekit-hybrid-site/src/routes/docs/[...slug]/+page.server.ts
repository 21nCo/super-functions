import { error } from "@sveltejs/kit";
import { generateStaticParams, resolveDocsPageSurface, resolveDocsRouteDataOrThrow } from "@docsfn/sveltekit";
import { loadHybridSiteSource } from "../../../lib/server/site-source";
import type { PageServerLoad } from "./$types";

export const entries = async () => {
  const { docs } = await loadHybridSiteSource();
  return generateStaticParams(docs.manifest, { basePath: docs.basePath, includeApiRoutes: false }).map(({ slug }) => ({ slug: slug ?? "" }));
};

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
  const docsSource = source.docs;

  let routeEntry;
  try {
    routeEntry = resolveDocsRouteDataOrThrow(params.slug, docsSource.manifest, {
      basePath: docsSource.basePath
    });
  } catch (routeError) {
    if (isRouteNotFoundError(routeError)) {
      throw error(404, routeError.message);
    }
    throw routeError;
  }

  if (routeEntry.kind !== "page") {
    throw error(404, `unsupported route kind for docs page: ${routeEntry.kind}`);
  }

  const surface = resolveDocsPageSurface({
    manifest: docsSource.manifest,
    route: routeEntry.route,
    page: routeEntry.page,
    options: {
      basePath: docsSource.basePath,
      homeHref: docsSource.basePath,
      canonicalUrl: docsSource.canonicalUrl
    }
  });

  const sidebar = docsSource.manifest.sidebars[surface.sidebarId ?? "default"];

  return {
    page: routeEntry.page,
    surface,
    sidebar,
    compatPreset: docsSource.compatPreset
  };
};
