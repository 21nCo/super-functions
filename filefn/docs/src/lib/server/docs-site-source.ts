import { basename, extname } from "node:path";
import docsConfig from "../../../docsfn.config";
import {
  assertValidSourceEntries,
  buildManifest,
  buildSearchIndex,
  compileSvelteContent,
  createDiagnostic,
  createDocsError,
  createSourceEntryId,
  createDocsSearchRuntime,
  normalizeProviderPath,
  toLegacyRawEntries,
  type CompiledContentArtifact,
  type DocsCollection,
  type DocsCompatPreset,
  type DocsConfig,
  type DocsContentProvider,
  type DocsManifest,
  type DocsSearchArtifact,
  type DocsSearchRuntime,
  type DocsSourceEntry,
} from "@docsfn/core";

const bundledContent = import.meta.glob("../../../content/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const bundledStatic = import.meta.glob("../../../static/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface DocsSiteSource {
  siteRoot: string;
  manifest: DocsManifest;
  searchArtifact: DocsSearchArtifact;
  siteTitle: string;
  canonicalUrl?: string;
  compatPreset: DocsCompatPreset;
  config: DocsConfig;
}

export interface DocsSiteCompiledCacheSummary {
  framework: "svelte";
  compatPreset: DocsCompatPreset;
  pageKeys: string[];
  postKeys: string[];
}

interface DocsSiteCompiledContentCache {
  framework: "svelte";
  compatPreset: DocsCompatPreset;
  pages: Map<string, CompiledContentArtifact>;
  posts: Map<string, CompiledContentArtifact>;
  pageKeysById: Record<string, string>;
  postKeysById: Record<string, string>;
}

interface DocsSiteServerState {
  source: DocsSiteSource;
  compiledCache: DocsSiteCompiledContentCache;
}

let serverStatePromise: Promise<DocsSiteServerState> | null = null;

function createCompiledCacheKey(input: {
  kind: "page" | "post";
  id: string;
  framework: "svelte";
  compatPreset: DocsCompatPreset;
}): string {
  return [input.kind, input.id, input.framework, input.compatPreset].join("|");
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    left.id.localeCompare(right.id, "en", {
      sensitivity: "variant",
      numeric: true,
    })
  );
}

function createCompiledCache(input: {
  manifest: DocsManifest;
  compatPreset: DocsCompatPreset;
}): DocsSiteCompiledContentCache {
  const framework = "svelte" as const;
  const pages = new Map<string, CompiledContentArtifact>();
  const posts = new Map<string, CompiledContentArtifact>();
  const pageKeysById: Record<string, string> = {};
  const postKeysById: Record<string, string> = {};

  for (const page of sortById(Object.values(input.manifest.pages))) {
    const key = createCompiledCacheKey({
      kind: "page",
      id: page.id,
      framework,
      compatPreset: input.compatPreset,
    });
    pageKeysById[page.id] = key;
    pages.set(
      key,
      compileSvelteContent({
        source: page.body,
        sourcePath: page.id,
        compatPreset: input.compatPreset,
      })
    );
  }

  for (const post of sortById(Object.values(input.manifest.posts))) {
    const key = createCompiledCacheKey({
      kind: "post",
      id: post.id,
      framework,
      compatPreset: input.compatPreset,
    });
    postKeysById[post.id] = key;
    posts.set(
      key,
      compileSvelteContent({
        source: post.body,
        sourcePath: post.id,
        compatPreset: input.compatPreset,
      })
    );
  }

  return {
    framework,
    compatPreset: input.compatPreset,
    pages,
    posts,
    pageKeysById,
    postKeysById,
  };
}

function getCompiledArtifactOrThrow(input: {
  kind: "page" | "post";
  id: string;
  cache: DocsSiteCompiledContentCache;
}): CompiledContentArtifact {
  const keysById =
    input.kind === "page" ? input.cache.pageKeysById : input.cache.postKeysById;
  const entries = input.kind === "page" ? input.cache.pages : input.cache.posts;
  const key = keysById[input.id];

  if (!key) {
    throw createDocsError({
      code: "DOCS_ARTIFACT_INVALID",
      message: `compiled ${input.kind} cache key is missing for ${input.id}`,
      diagnostics: [
        createDiagnostic({
          code: "DOCS_ARTIFACT_INVALID",
          message: `compiled ${input.kind} cache key is missing for ${input.id}`,
          details: {
            kind: input.kind,
            id: input.id,
          },
        }),
      ],
    });
  }

  const compiled = entries.get(key);
  if (!compiled) {
    throw createDocsError({
      code: "DOCS_ARTIFACT_INVALID",
      message: `compiled ${input.kind} artifact is missing for ${input.id}`,
      diagnostics: [
        createDiagnostic({
          code: "DOCS_ARTIFACT_INVALID",
          message: `compiled ${input.kind} artifact is missing for ${input.id}`,
          details: {
            kind: input.kind,
            id: input.id,
            key,
          },
        }),
      ],
    });
  }

  return compiled;
}

async function loadDocsSiteServerState(): Promise<DocsSiteServerState> {
  if (!serverStatePromise) {
    serverStatePromise = (async () => {
      const siteRoot = ".";
      const config = docsConfig satisfies DocsConfig;
      const provider = createBundledContentProvider(config);
      const manifest = await buildManifest(provider, config);
      const searchArtifact = await buildSearchIndex(manifest, {
        search: config.search,
        auth: config.auth,
      });
      const compatPreset = config.compat?.preset ?? "none";
      const compiledCache = createCompiledCache({
        manifest,
        compatPreset,
      });

      return {
        source: {
          siteRoot,
          manifest,
          searchArtifact,
          siteTitle: config.site.title,
          canonicalUrl: config.site.canonicalUrl,
          compatPreset,
          config,
        },
        compiledCache,
      };
    })();
  }

  return serverStatePromise;
}

export async function loadDocsSiteSource(): Promise<DocsSiteSource> {
  const state = await loadDocsSiteServerState();
  return state.source;
}

export async function getCompiledDocsPage(pageId: string): Promise<CompiledContentArtifact> {
  const state = await loadDocsSiteServerState();
  return getCompiledArtifactOrThrow({
    kind: "page",
    id: pageId,
    cache: state.compiledCache,
  });
}

export async function getCompiledDocsPost(postId: string): Promise<CompiledContentArtifact> {
  const state = await loadDocsSiteServerState();
  return getCompiledArtifactOrThrow({
    kind: "post",
    id: postId,
    cache: state.compiledCache,
  });
}

export async function getDocsSiteCompiledCacheSummary(): Promise<DocsSiteCompiledCacheSummary> {
  const state = await loadDocsSiteServerState();
  return {
    framework: state.compiledCache.framework,
    compatPreset: state.compiledCache.compatPreset,
    pageKeys: [...state.compiledCache.pages.keys()].sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "variant", numeric: true })
    ),
    postKeys: [...state.compiledCache.posts.keys()].sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "variant", numeric: true })
    ),
  };
}

export async function createDocsSiteSearchRuntime(): Promise<DocsSearchRuntime> {
  const state = await loadDocsSiteServerState();
  return createDocsSearchRuntime({
    artifact: state.source.searchArtifact,
  });
}

function createBundledContentProvider(config: DocsConfig): DocsContentProvider {
  const modules = {
    ...normalizeBundledModules(bundledContent, "../../../"),
    ...normalizeBundledModules(bundledStatic, "../../../"),
  };

  return {
    providerId: "bundled",
    async listEntries(input) {
      const entries = input.collections.flatMap((collection) =>
        collectEntriesForCollection(collection, modules, config)
      );
      return assertValidSourceEntries(entries);
    },
    async loadEntry(input) {
      return input.entry;
    },
    async list() {
      const entries = await this.listEntries({
        config,
        collections: ["docs", "pages", "blog", "api", "assets"],
      });
      return toLegacyRawEntries(entries);
    },
  };
}

function normalizeBundledModules(
  modules: Record<string, string>,
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(modules).map(([modulePath, source]) => [
      normalizeProviderPath(modulePath.replace(prefix, "")),
      source,
    ]),
  );
}

function collectEntriesForCollection(
  collection: DocsCollection,
  modules: Record<string, string>,
  config: DocsConfig,
): DocsSourceEntry[] {
  const directory = collectionDirectory(collection, config);
  const entries: DocsSourceEntry[] = [];

  for (const [modulePath, source] of Object.entries(modules)) {
    if (modulePath !== directory && !modulePath.startsWith(`${directory}/`)) {
      continue;
    }

    const relativePath = normalizeProviderPath(modulePath.slice(directory.length + 1));
    if (!relativePath || relativePath === ".gitkeep") {
      continue;
    }

    const extension = extname(relativePath).toLowerCase();
    const fileName = basename(relativePath).toLowerCase();

    if (fileName === (config.content.metaFileName ?? "meta.json")) {
      entries.push(createControlEntry(collection, relativePath, source));
      continue;
    }

    if (collection === "assets") {
      entries.push(createAssetEntry(relativePath, source));
      continue;
    }

    if (["docs", "pages", "blog"].includes(collection) && [".md", ".mdx"].includes(extension)) {
      entries.push(createMarkdownEntry(collection, relativePath, source));
      continue;
    }

    if (collection === "api" && [".json", ".yaml", ".yml"].includes(extension)) {
      entries.push(createApiEntry(relativePath, source));
    }
  }

  return entries.sort((left, right) =>
    left.id.localeCompare(right.id, "en", { sensitivity: "variant", numeric: true }),
  );
}

function collectionDirectory(collection: DocsCollection, config: DocsConfig): string {
  if (collection === "docs") return config.content.docsDir ?? "content/docs";
  if (collection === "pages") return config.content.pagesDir ?? "content/pages";
  if (collection === "blog") return config.content.blogDir ?? "content/blog";
  if (collection === "api") return config.content.apiDir ?? "content/api";
  return config.content.assetsDir ?? "static";
}

function createMarkdownEntry(
  collection: Extract<DocsCollection, "docs" | "pages" | "blog">,
  relativePath: string,
  source: string,
): DocsSourceEntry {
  const parsed = parseFrontmatter(source);
  return {
    id: createSourceEntryId(collection, relativePath),
    collection,
    relativePath,
    absolutePath: `${collection}/${relativePath}`,
    entryType: "content",
    body: parsed.body,
    frontmatter: {
      title: deriveTitleFromPath(relativePath),
      ...parsed.frontmatter,
    },
    bytes: byteLength(source),
    updatedAt: "1970-01-01T00:00:00.000Z",
    meta: {
      extension: extname(relativePath).toLowerCase(),
    },
  };
}

function createControlEntry(
  collection: DocsCollection,
  relativePath: string,
  source: string,
): DocsSourceEntry {
  return {
    id: createSourceEntryId(collection, relativePath),
    collection,
    relativePath,
    absolutePath: `${collection}/${relativePath}`,
    entryType: "control",
    body: source,
    frontmatter: {},
    bytes: byteLength(source),
    updatedAt: "1970-01-01T00:00:00.000Z",
    meta: {
      controlFile: true,
      parsed: parseJson(source),
    },
  };
}

function createApiEntry(relativePath: string, source: string): DocsSourceEntry {
  return {
    id: createSourceEntryId("api", relativePath),
    collection: "api",
    relativePath,
    absolutePath: `api/${relativePath}`,
    entryType: "content",
    body: source,
    frontmatter: {
      title: deriveTitleFromPath(relativePath),
    },
    bytes: byteLength(source),
    updatedAt: "1970-01-01T00:00:00.000Z",
    meta: {
      extension: extname(relativePath).toLowerCase(),
    },
  };
}

function createAssetEntry(relativePath: string, source: string): DocsSourceEntry {
  return {
    id: createSourceEntryId("assets", relativePath),
    collection: "assets",
    relativePath,
    absolutePath: `assets/${relativePath}`,
    entryType: "asset",
    frontmatter: {},
    bytes: byteLength(source),
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function parseFrontmatter(source: string): {
  body: string;
  frontmatter: Record<string, unknown>;
} {
  if (!source.startsWith("---\n")) {
    return { body: source, frontmatter: {} };
  }

  const closingIndex = source.indexOf("\n---", 4);
  if (closingIndex === -1) {
    return { body: source, frontmatter: {} };
  }

  const rawFrontmatter = source.slice(4, closingIndex);
  const body = source.slice(closingIndex + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;

    frontmatter[key] = parseFrontmatterValue(value);
  }

  return { body, frontmatter };
}

function parseFrontmatterValue(value: string): unknown {
  const unquoted = value.replace(/^['"]|['"]$/g, "");
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  return unquoted;
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function deriveTitleFromPath(relativePath: string): string {
  return basename(relativePath)
    .replace(/\.[^/.]+$/, "")
    .split(/[-_]/g)
    .map((segment) =>
      segment.length > 0 ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` : segment,
    )
    .join(" ");
}

function byteLength(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}
