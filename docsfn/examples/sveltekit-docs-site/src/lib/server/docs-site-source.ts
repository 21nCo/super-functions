import path from "node:path";
import {
  buildManifest,
  buildSearchIndex,
  createDocsSearchRuntime,
  loadDocsConfig,
  type DocsCompatPreset,
  type DocsManifest,
  type DocsSearchArtifact,
} from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";

export interface DocsSiteSource {
  fixtureRoot: string;
  manifest: DocsManifest;
  searchArtifact: DocsSearchArtifact;
  searchProbe: {
    query: string;
    resultCount: number;
    firstPath?: string;
    scopes: string[];
  };
  siteTitle: string;
  canonicalUrl?: string;
  compatPreset: DocsCompatPreset;
}

const defaultFixtureRoot = path.resolve(
  process.cwd(),
  "../../test-fixtures/repo/searchfn-docs"
);

let sourcePromise: Promise<DocsSiteSource> | null = null;

function resolveFixtureRoot(): string {
  const override = process.env.DOCSFN_FIXTURE_ROOT;
  return override?.trim() ? path.resolve(process.cwd(), override) : defaultFixtureRoot;
}

async function buildSearchProbe(
  searchArtifact: DocsSearchArtifact
): Promise<DocsSiteSource["searchProbe"]> {
  const probeQuery =
    searchArtifact.documents.find((document) => document.title.trim().length > 0)?.title ??
    searchArtifact.documents[0]?.summary ??
    "docs";
  const results = await createDocsSearchRuntime({ artifact: searchArtifact }).query({
    query: probeQuery,
    limit: 5,
  });
  return {
    query: probeQuery,
    resultCount: results.length,
    firstPath: results[0]?.path,
    scopes: [...searchArtifact.scopes],
  };
}

async function createDocsSiteSource(): Promise<DocsSiteSource> {
  const fixtureRoot = resolveFixtureRoot();
  const config = await loadDocsConfig({ cwd: fixtureRoot });
  const manifest = await buildManifest(new FsContentProvider({ root: fixtureRoot }), config);
  const searchArtifact = await buildSearchIndex(manifest, {
    search: config.search,
    auth: config.auth,
  });
  return {
    fixtureRoot,
    manifest,
    searchArtifact,
    searchProbe: await buildSearchProbe(searchArtifact),
    siteTitle: config.site.title,
    canonicalUrl: config.site.canonicalUrl,
    compatPreset: config.compat?.preset ?? "none",
  };
}

export async function loadDocsSiteSource(): Promise<DocsSiteSource> {
  sourcePromise ??= createDocsSiteSource();
  return sourcePromise;
}
