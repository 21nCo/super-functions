import path from "node:path";
import { fileURLToPath } from "node:url";
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

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirectory = path.dirname(thisFilePath);
const DEFAULT_FIXTURE_ROOT = path.resolve(
  thisDirectory,
  "../../test-fixtures/repo/searchfn-docs"
);

let sourcePromise: Promise<DocsSiteSource> | null = null;

function resolveFixtureRoot(): string {
  const override = process.env.DOCSFN_FIXTURE_ROOT;
  if (override && override.trim().length > 0) {
    return path.resolve(thisDirectory, override);
  }
  return DEFAULT_FIXTURE_ROOT;
}

async function buildSearchProbe(
  searchArtifact: DocsSearchArtifact
): Promise<DocsSiteSource["searchProbe"]> {
  const probeQuery =
    searchArtifact.documents.find((document) => document.title.trim().length > 0)?.title ??
    searchArtifact.documents[0]?.summary ??
    "docs";
  const runtime = createDocsSearchRuntime({
    artifact: searchArtifact,
  });
  const results = await runtime.query({
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

export async function loadDocsSiteSource(): Promise<DocsSiteSource> {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      const fixtureRoot = resolveFixtureRoot();
      const config = await loadDocsConfig({
        cwd: fixtureRoot,
      });

      const provider = new FsContentProvider({
        root: fixtureRoot,
      });
      const manifest = await buildManifest(provider, config);
      const searchArtifact = await buildSearchIndex(manifest, {
        search: config.search,
        auth: config.auth,
      });
      const searchProbe = await buildSearchProbe(searchArtifact);

      return {
        fixtureRoot,
        manifest,
        searchArtifact,
        searchProbe,
        siteTitle: config.site.title,
        canonicalUrl: config.site.canonicalUrl,
        compatPreset: config.compat?.preset ?? "none",
      };
    })();
  }

  return sourcePromise;
}
