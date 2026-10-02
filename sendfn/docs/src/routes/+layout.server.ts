import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  const source = await loadDocsSiteSource();
  // Keep the complete content manifest and search index on the server.
  return {
    source: {
      siteTitle: source.siteTitle,
      config: { site: source.config.site, navigation: source.config.navigation },
    },
  };
};
