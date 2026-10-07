import { resolveEmbedMode, resolveEmbedSidebarMode } from "@docsfn/sveltekit";
import { loadRequestDocsSiteSource } from "$lib/server/docs-site-source";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ request, url }) => {
  const source = await loadRequestDocsSiteSource(request);
  // Layout data is serialized to every page; manifests and search artifacts stay server-side.
  return {
    embed: resolveEmbedMode(url),
    embedSidebar: resolveEmbedSidebarMode(url),
    site: {
      title: source.siteTitle,
      description: source.config.site.description,
      showFooter: source.config.site.showFooter !== false,
      topNav: source.config.navigation?.topNav ?? [],
    },
  };
};
