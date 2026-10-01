import { error } from "@sveltejs/kit";
import {
  getTopNavigation,
  type CompiledContentArtifact,
  type Sidebar,
} from "@docsfn/core";
import {
  resolveDocsPageSurface,
  resolveDocsRouteDataOrThrow,
  type SvelteDocsPageSurface,
} from "@docsfn/sveltekit";
import type { DocsSiteSource } from "./runtime";

interface DocsPageOptions {
  apiBreadcrumbLabel?: string;
  apiBreadcrumbHref?: string;
  fallbackSidebarId?: string;
}

function buildCanonicalUrl(canonicalBase: string | undefined, path: string): string {
  if (!canonicalBase) return path;
  let end = canonicalBase.length;
  while (end > 0 && canonicalBase[end - 1] === "/") end -= 1;
  const origin = canonicalBase.slice(0, end);
  const pathname = path.startsWith("/") ? path : "/" + path;
  return origin + pathname;
}

function isRouteNotFoundError(input: unknown): input is { message: string } {
  return (
    typeof input === "object" && input !== null &&
    "code" in input && input.code === "DOCS_ROUTE_NOT_FOUND" &&
    "message" in input && typeof input.message === "string"
  );
}

function hasNestedDocsRoutes(routes: Record<string, string>, route: string): boolean {
  return Object.keys(routes).some((candidate) => candidate.startsWith(`${route}/`));
}

export async function loadDocsPage(input: {
  slug: string | undefined;
  source: DocsSiteSource;
  getCompiledDocsPage: (id: string) => Promise<CompiledContentArtifact>;
  resolveMarkdownRelativeLinks: (input: {
    compiled: CompiledContentArtifact;
    route: string;
    sourcePath: string;
    isIndexRoute: boolean;
  }) => CompiledContentArtifact;
  options?: DocsPageOptions;
}) {
  const { slug, source, getCompiledDocsPage, resolveMarkdownRelativeLinks, options = {} } = input;
  let routeEntry;
  try {
    routeEntry = resolveDocsRouteDataOrThrow(slug, source.manifest, { basePath: "/docs" });
  } catch (routeError) {
    if (isRouteNotFoundError(routeError)) throw error(404, routeError.message);
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
      description: typeof api.frontmatter.description === "string" ? api.frontmatter.description : undefined,
      canonicalPath: route,
      canonicalUrl: buildCanonicalUrl(source.canonicalUrl, route),
      sidebarId: "api",
      headings: [],
      breadcrumbs: [
        { label: "Docs", href: "/docs" },
        { label: options.apiBreadcrumbLabel ?? "API Reference", href: options.apiBreadcrumbHref ?? "/docs/api" },
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
  const sidebar: Sidebar | undefined = source.manifest.sidebars[sidebarId] ??
    (options.fallbackSidebarId ? source.manifest.sidebars[options.fallbackSidebarId] : undefined);
  const compiled = routeEntry.kind === "page"
    ? resolveMarkdownRelativeLinks({
        compiled: await getCompiledDocsPage(routeEntry.page.id),
        route: routeEntry.route,
        sourcePath: routeEntry.page.id.slice(routeEntry.page.id.indexOf(":") + 1),
        isIndexRoute: hasNestedDocsRoutes(source.manifest.routes, routeEntry.route),
      })
    : undefined;

  return {
    routeEntry: routeEntry.kind === "page" ? { kind: "page" as const } : routeEntry,
    surface,
    sidebar,
    compiled,
    searchDocumentCount: Array.isArray(source.searchArtifact.documents) ? source.searchArtifact.documents.length : 0,
    searchScopes: Array.isArray(source.searchArtifact.scopes) ? source.searchArtifact.scopes.join(", ") : "none",
    siteTitle: source.siteTitle,
    compatPreset: source.compatPreset,
  };
}
