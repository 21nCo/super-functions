import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { LayoutServerLoad } from "./$types";

export const load = (async () => {
  const source = await loadDocsSiteSource();
  return {
    source: {
      siteTitle: source.siteTitle,
      config: { site: source.config.site, navigation: source.config.navigation },
    },
  };
}) satisfies LayoutServerLoad;
