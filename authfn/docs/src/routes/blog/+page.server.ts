import { loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const source = await loadDocsSiteSource();

  const posts = Object.values(source.manifest.posts)
    .filter((post) => !post.draft)
    .sort((left, right) => right.date.localeCompare(left.date));

  return { posts: posts.map(({ id, slug, title, date, excerpt, summary }) => ({ id, slug, title, date, excerpt, summary })) };
};
