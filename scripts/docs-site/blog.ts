import { error, redirect } from "@sveltejs/kit";
import {
  generateRSSFeed,
  type CompiledContentArtifact,
  type DocsManifest,
} from "@docsfn/core";
import { getPostData } from "@docsfn/sveltekit";
import type { DocsSiteSource } from "./runtime";

// An application mount, not a property supported by the published DocsConfig.
export const docsBlogBasePath = "/docs/blog";

/** Native literal routes reserve this prefix; published provider paths stay intact. */
export function assertDocsBlogMount(manifest: DocsManifest): void {
  const ordinary = [...Object.values(manifest.pages), ...Object.values(manifest.apis)];
  const pathname = (value: string) => decodeURIComponent(new URL(value, "https://docs.invalid").pathname);
  if (ordinary.some(({ path }) => pathname(path) === docsBlogBasePath || pathname(path).startsWith(`${docsBlogBasePath}/`))) {
    throw new Error("Documentation conflicts with the reserved public Blog mount");
  }
  for (const post of Object.values(manifest.posts)) {
    if (!post.path.startsWith(`${docsBlogBasePath}/`) ||
        pathname(post.path) !== decodeURIComponent(post.path) ||
        pathname(post.path) === `${docsBlogBasePath}/rss.xml`) {
      throw new Error("Blog post conflicts with the native public Blog mount/feed");
    }
  }
}

export function loadBlogIndex(source: DocsSiteSource) {
  const posts = Object.values(source.manifest.posts)
    .filter((post) => !post.draft)
    .sort((left, right) => right.date.localeCompare(left.date));
  return {
    posts: posts.map(({ id, slug, title, date, excerpt, summary, path }) => ({
      id, slug, title, date, excerpt, summary, path,
    })),
  };
}

export async function loadBlogPost(input: {
  slug: string | undefined;
  source: DocsSiteSource;
  getCompiledDocsPost: (id: string) => Promise<CompiledContentArtifact>;
  resolveMarkdownRelativeLinks: (input: {
    compiled: CompiledContentArtifact; route: string; sourcePath: string;
  }) => CompiledContentArtifact;
}) {
  const canonical = input.slug ? getPostData(input.slug, input.source.manifest) : null;
  // The published Markdown resolver retains source extensions in relative links.
  // Admit only an exact bundled provider identity, never filesystem discovery.
  const post = canonical ?? Object.values(input.source.manifest.posts)
    .find(({ id }) => id.slice(id.indexOf(":") + 1) === input.slug);
  if (!post || post.draft) throw error(404, "Post not found");
  if (!canonical) throw redirect(308, new URL(post.path, "https://docs.invalid").pathname);
  const route = post.path;
  const compiled = input.resolveMarkdownRelativeLinks({
    compiled: await input.getCompiledDocsPost(post.id),
    route,
    sourcePath: post.id.slice(post.id.indexOf(":") + 1),
  });
  return {
    post: {
      id: post.id, title: post.title, date: post.date, summary: post.summary,
      excerpt: post.excerpt, author: post.author, tags: post.tags, path: route,
    },
    compiled,
    siteTitle: input.source.siteTitle,
  };
}

export function createBlogFeed(source: DocsSiteSource, url: URL): Response {
  const blogLink = `${url.origin}${source.manifest.blog?.listRoute ?? docsBlogBasePath}`;
  const xml = generateRSSFeed(source.manifest, {
    title: `${source.siteTitle} Blog`,
    description: source.config.site.description ?? "Blog posts",
    link: blogLink,
    feedHref: `${url.origin}${source.manifest.blog?.feedPath ?? `${docsBlogBasePath}/rss.xml`}`,
    itemHref: (post) => `${url.origin}${post.path}`,
  });
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
