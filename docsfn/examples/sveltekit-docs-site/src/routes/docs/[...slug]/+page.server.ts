import { error } from "@sveltejs/kit";
import type { SidebarItem } from "@docsfn/core";
import {
  resolveDocsPageSurface,
  resolveDocsRouteDataOrThrow,
} from "@docsfn/sveltekit";
import type { PageServerLoad } from "./$types";

interface FlattenedSidebarLink {
  label: string;
  path: string;
  depth: number;
}

function flattenSidebarLinks(
  items: SidebarItem[],
  depth = 0,
  links: FlattenedSidebarLink[] = []
): FlattenedSidebarLink[] {
  for (const item of items) {
    if (item.type === "link" && item.link) {
      links.push({
        label: item.text,
        path: item.link,
        depth,
      });
      continue;
    }
    if (item.type === "group" && Array.isArray(item.items)) {
      flattenSidebarLinks(item.items, depth + 1, links);
    }
  }

  return links;
}

function isRouteNotFoundError(input: unknown): input is { message: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    "code" in input &&
    String((input as { code: unknown }).code) === "DOCS_ROUTE_NOT_FOUND"
  );
}

export const load: PageServerLoad = async ({ params, parent }) => {
  const { source } = await parent();

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

  const surface = resolveDocsPageSurface({
    manifest: source.manifest,
    route: routeEntry.route,
    page: routeEntry.kind === "page" ? routeEntry.page : undefined,
    options: {
      basePath: "/docs",
      homeHref: "/docs",
      canonicalUrl: source.canonicalUrl,
      versionMode: "path-prefix",
    },
  });

  const sidebar = source.manifest.sidebars[surface.sidebarId ?? "default"];
  const sidebarLinks = sidebar ? flattenSidebarLinks(sidebar.items) : [];
  const searchDocumentCount = Array.isArray(source.searchArtifact.documents)
    ? source.searchArtifact.documents.length
    : 0;
  const searchScopes = Array.isArray(source.searchArtifact.scopes)
    ? source.searchArtifact.scopes.join(", ")
    : "none";

  return {
    routeEntry,
    surface,
    sidebarLinks,
    searchDocumentCount,
    searchScopes,
    searchProbe: source.searchProbe,
    siteTitle: source.siteTitle,
    compatPreset: source.compatPreset,
  };
};
