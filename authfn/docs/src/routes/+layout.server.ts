import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  return {
    source: await loadDocsSiteSource(),
  };
};
