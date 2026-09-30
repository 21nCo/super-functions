import { it, expect, vi } from "vitest";
import { compileSvelteContent } from "@docsfn/core";
import { load } from "../../authfn/docs/src/routes/docs/[...slug]/+page.server";

const fixture = vi.hoisted(() => ({
  source: {} as Record<string, unknown>,
  compiled: {} as ReturnType<typeof compileSvelteContent>,
}));
vi.mock("$lib/server/docs-site-source", () => ({
  loadDocsSiteSource: async () => fixture.source,
  getCompiledDocsPage: async () => fixture.compiled,
}));
vi.mock("@docsfn/sveltekit", () => ({
  resolveDocsRouteDataOrThrow: () => ({ kind: "page", route: "/docs/guide",
    page: { id: "docs:guide.md", sourcePath: "guide.md", body: "raw provider body" } }),
  resolveDocsPageSurface: () => ({ sidebarId: "missing" }),
}));

it("AuthFn's actual route opts into docs sidebar fallback and avoids duplicate raw source", async () => {
  const sidebar = { id: "docs", items: [] };
  fixture.source = { manifest: { sidebars: { docs: sidebar }, routes: {} }, searchArtifact: {} };
  fixture.compiled = compileSvelteContent({ source: "Rendered content." });
  const result = await load({ params: { slug: "guide" } } as Parameters<typeof load>[0]);
  expect(result.sidebar).toBe(sidebar);
  expect(result.routeEntry).toEqual({ kind: "page" });
  expect(JSON.stringify(result)).not.toContain("raw provider body");
});
