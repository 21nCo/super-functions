import {
  buildManifest,
  type DocPage,
  type DocsCompatPreset,
  type DocsConfig,
  type DocsManifest,
} from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import docsConfig, { papersConfig } from "../../../docsfn.config";

export interface HybridManifestSource {
  manifest: DocsManifest;
  compatPreset: DocsCompatPreset;
  basePath: string;
  canonicalUrl?: string;
}

export interface HybridSiteSource {
  appRoot: string;
  siteTitle: string;
  canonicalUrl?: string;
  docs: HybridManifestSource;
  papers: HybridManifestSource;
}

const appRoot = process.cwd();

let sourcePromise: Promise<HybridSiteSource> | null = null;

async function buildManifestSource(config: DocsConfig): Promise<HybridManifestSource> {
  const provider = new FsContentProvider({ root: appRoot });
  const manifest = await buildManifest(provider, config);

  return {
    manifest,
    compatPreset: config.compat?.preset ?? "none",
    basePath: config.site.basePath ?? "/docs",
    canonicalUrl: config.site.canonicalUrl
  };
}

export async function loadHybridSiteSource(): Promise<HybridSiteSource> {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      const [docs, papers] = await Promise.all([
        buildManifestSource(docsConfig),
        buildManifestSource(papersConfig)
      ]);

      return {
        appRoot,
        siteTitle: docsConfig.site.title,
        canonicalUrl: docsConfig.site.canonicalUrl,
        docs,
        papers
      };
    })();
  }

  return sourcePromise;
}

export function getStandalonePageByPath(
  manifest: DocsManifest,
  routePath: string
): DocPage | null {
  const pageId = manifest.routes[routePath];
  if (!pageId) {
    return null;
  }

  return manifest.pages[pageId] ?? null;
}

export function getPaperLandingPages(manifest: DocsManifest): DocPage[] {
  return Object.values(manifest.pages)
    .filter((page) => page.slug.length > 0 && !page.slug.includes("/"))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
}
