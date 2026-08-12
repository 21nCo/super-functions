import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  const { source } = await parent();

  const posts = Object.values(source.manifest.posts)
    .filter((post) => !post.draft)
    .sort((left, right) => right.date.localeCompare(left.date));

  return { posts };
};
