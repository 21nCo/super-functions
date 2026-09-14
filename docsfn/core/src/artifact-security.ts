import type { ApiReference } from "./types";

/** An API overview embeds its child content. Omit it if any child is protected. */
export function isApiArtifactProtected(
  api: ApiReference,
  isProtected: (route: string) => boolean,
  requireCanonicalRoutes = false,
): boolean {
  if (isProtected(api.path)) return true;
  if (requireCanonicalRoutes && !Array.isArray(api.spec?.operations)) return true;
  return [api.spec?.operations, api.spec?.schemas, api.spec?.tags].some(entries =>
    Array.isArray(entries) && entries.some(entry => typeof entry?.routePath === "string" && isProtected(entry.routePath)),
  );
}
