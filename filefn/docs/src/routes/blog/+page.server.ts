import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import { loadBlogIndex } from "../../../../../scripts/docs-site/blog";
import type { PageServerLoad } from "./$types";

export const load = (async () => loadBlogIndex(await loadDocsSiteSource())) satisfies PageServerLoad;
