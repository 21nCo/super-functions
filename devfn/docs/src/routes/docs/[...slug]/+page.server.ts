import { error } from "@sveltejs/kit";
import { getTopNavigation, resolveMarkdownRelativeLinks, type Sidebar } from "@docsfn/core";
import {
  resolveDocsPageSurface,
  resolveDocsRouteDataOrThrow,
  type SvelteDocsPageSurface,
} from "@docsfn/sveltekit";
import { getCompiledDocsPage, loadDocsSiteSource } from "$lib/server/docs-site-source";
import type { PageServerLoad } from "./$types";

function buildCanonicalUrl(canonicalBase: string | undefined, path: string): string {
  if (!canonicalBase) {
    return path;
  }
  let end = canonicalBase.length;
  while (end > 0 && canonicalBase[end - 1] === "/") end--;
  const origin = canonicalBase.slice(0, end);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

function isRouteNotFoundError(input: unknown): input is { message: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    "code" in input &&
    input.code === "DOCS_ROUTE_NOT_FOUND" &&
    "message" in input &&
    typeof input.message === "string"
  );
}

function hasNestedDocsRoutes(routes: Record<string, string>, route: string): boolean {
  return Object.keys(routes).some((candidate) => candidate.startsWith(`${route}/`));
}

export const load: PageServerLoad = async ({ params }) => {
  const source = await loadDocsSiteSource();

  let routeEntry;
  try {
    routeEntry = resolveDocsRouteDataOrThrow(params.slug, source.manifest, {
      basePath: "/docs",
    });
  } catch (routeError) {
    if (isRouteNotFoundError(routeError)) {
      throw error(404, routeError.message);
    }
    throw routeError;
  }

  if (routeEntry.kind === "post") {
    throw error(404, `unsupported docs route kind: ${routeEntry.kind}`);
  }

  let surface: SvelteDocsPageSurface;
  if (routeEntry.kind === "api") {
    const api = routeEntry.api;
    const route = routeEntry.route;
    surface = {
      route,
      title: api.title,
      description:
        typeof api.frontmatter.description === "string" ? api.frontmatter.description : undefined,
      canonicalPath: route,
      canonicalUrl: buildCanonicalUrl(source.canonicalUrl, route),
      sidebarId: source.manifest.sidebars.api ? "api" : "docs",
      headings: [],
      breadcrumbs: [
        { label: "Docs", href: "/docs" },
        { label: "Package reference", href: "/docs/reference" },
        { label: api.title, href: route },
      ],
      pagination: {},
      topNav: getTopNavigation(source.manifest),
      versions: source.manifest.versions,
    };
  } else {
    surface = resolveDocsPageSurface({
      manifest: source.manifest,
      route: routeEntry.route,
      page: routeEntry.page,
      options: {
        basePath: "/docs",
        homeHref: "/docs",
        canonicalUrl: source.canonicalUrl,
        versionMode: "path-prefix",
      },
    });
  }

  const sidebarId = surface.sidebarId ?? "default";
  const sidebar: Sidebar | undefined = source.manifest.sidebars[sidebarId];

  const compiled =
    routeEntry.kind === "page"
      ? resolveMarkdownRelativeLinks({
          compiled: await getCompiledDocsPage(routeEntry.page.id),
          route: routeEntry.route,
          sourcePath: routeEntry.page.id.replace(/^docs:/, ""),
          isIndexRoute: hasNestedDocsRoutes(source.manifest.routes, routeEntry.route),
        })
      : undefined;

  return {
    routeEntry,
    surface,
    sidebar,
    compiled,
    siteTitle: source.siteTitle,
  };
};
