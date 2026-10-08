import { loadHybridSiteSource } from "../lib/server/site-source";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  const source = await loadHybridSiteSource();
  // Layout data is serialized to every page; manifests stay in server-only loads.
  return {
    site: {
      title: source.siteTitle,
      topNav: source.docs.manifest.topNav ?? []
    }
  };
};
