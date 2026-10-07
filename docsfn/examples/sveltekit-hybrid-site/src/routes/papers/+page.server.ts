import { getPaperLandingPages, loadHybridSiteSource } from "../../lib/server/site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const source = await loadHybridSiteSource();

  return {
    papers: getPaperLandingPages(source.papers.manifest)
  };
};
