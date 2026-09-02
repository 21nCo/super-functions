import path from "node:path";
import { readdir, stat } from "node:fs/promises";
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
let sourceSignature = "";

async function contentSignature(root: string): Promise<string> {
  let latest = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      try {
        const info = await stat(fullPath);
        if (info.mtimeMs > latest) {
          latest = info.mtimeMs;
        }
      } catch {
        continue;
      }
    }
  }
  return String(latest);
}

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
  const createSource = async () => {
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
  };

  if (process.env.NODE_ENV === "development") {
    const signature = await contentSignature(appRoot);
    if (!sourcePromise || signature !== sourceSignature) {
      sourceSignature = signature;
      sourcePromise = createSource();
    }
    return sourcePromise;
  }

  sourcePromise ??= createSource();
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
