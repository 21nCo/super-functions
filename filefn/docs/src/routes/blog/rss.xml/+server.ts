import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import { createBlogFeed } from "../../../../../../scripts/docs-site/blog";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => createBlogFeed(await loadDocsSiteSource(), url);
