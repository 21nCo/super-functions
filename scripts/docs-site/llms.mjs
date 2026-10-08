import { closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
/**
 * Resolve DocsFn from the consumer site so each site's published package pin is honored.
 * @param {string} cwd
 * @param {{buildManifest: Function, loadDocsConfig: Function, FsContentProvider: new (options: object) => object}} dependencies
 */
export async function loadLlmsSiteSource(cwd, dependencies) {
  const { buildManifest, loadDocsConfig, FsContentProvider } = dependencies;
  const loadedConfig = await loadDocsConfig({ cwd });
  const config = {
    ...loadedConfig,
    content: {
      ...loadedConfig.content,
      root: resolve(cwd, loadedConfig.content.root || "."),
    },
  };
  const provider = new FsContentProvider({
    root: config.content.root,
    docsDir: config.content.docsDir,
    pagesDir: config.content.pagesDir,
    blogDir: config.content.blogDir,
    apiDir: config.content.apiDir,
    assetsDir: config.content.assetsDir,
  });
  const manifest = await buildManifest(provider, config);
  return { config, manifest };
}

/** @param {string} cwd
 * @param {Parameters<typeof loadLlmsSiteSource>[1] & { buildLlmsTxtArtifacts: Function }} dependencies
 */
export async function buildLlmsSiteArtifacts(cwd, dependencies, options = {}) {
  const { config, manifest } = await loadLlmsSiteSource(cwd, dependencies);
  const { buildLlmsTxtArtifacts } = dependencies;
  const canonicalUrl = options.canonicalUrl ?? config.site?.canonicalUrl;
  const artifacts = buildLlmsTxtArtifacts(manifest, {
    canonicalUrl,
    includeBlog: false,
  });
  return { artifacts, config, manifest, canonicalUrl };
}

/**
 * Keep LLM indexes navigable before a public documentation host is assigned.
 * @param {string} text
 * @param {import("@docsfn/core").DocsManifest} manifest
 * @param {string} product
 * @param {string | undefined} canonicalUrl
 */
export function withSourceLinks(text, manifest, product, canonicalUrl) {
  if (canonicalUrl) return text;
  const sources = new Map(Object.values(manifest.pages)
    .filter((page) => page.id.startsWith("docs:"))
    .map((page) => [new URL(page.path, "https://docs.invalid").pathname, page.id.slice("docs:".length)]));
  return text.replace(/\]\((\/docs[^\s)]*)\)/g, (match, href) => {
    const url = new URL(href, "https://docs.invalid");
    const source = sources.get(url.pathname);
    if (!source) return match;
    const path = source.split("/").map(encodeURIComponent).join("/");
    return `](https://github.com/21nCo/super-functions/blob/dev/${product}/docs/content/docs/${path}${url.hash})`;
  });
}

/**
 * Replace one regular artifact in a trusted output directory atomically.
 * This promises per-path visibility, not a two-file transaction or power-loss durability.
 * @param {string} target
 * @param {string} body
 */
function replaceArtifact(target, body) {
  let previous;
  try { previous = lstatSync(target); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  if (previous && !previous.isFile()) throw new Error(`Artifact target must be a regular file: ${target}`);
  const mode = previous ? previous.mode & 0o777 : undefined;
  const temporary = `${target}.${randomUUID()}.tmp`;
  let descriptor;
  let owned = false;
  try {
    descriptor = openSync(temporary, "wx", mode ?? 0o666);
    owned = true;
    writeFileSync(descriptor, body, "utf8");
    if (mode !== undefined) fchmodSync(descriptor, mode);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    owned = false;
  } catch (error) {
    const failures = [error];
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch (closeError) { failures.push(closeError); }
    }
    if (owned) {
      try { unlinkSync(temporary); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, `Artifact replacement failed: ${target}`, { cause: error });
    throw error;
  }
}

/**
 * --check compares without modifying tracked artifacts.
 * @param {string} directory
 * @param {{llmsTxt: string, llmsFullTxt: string}} artifacts
 * @param {boolean} check
 */
export function writeLlmsArtifacts(directory, artifacts, check = process.argv.includes("--check")) {
  const files = { "llms.txt": artifacts.llmsTxt, "llms-full.txt": artifacts.llmsFullTxt };
  if (!check) mkdirSync(directory, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const target = resolve(directory, name);
    if (check) {
      let actual;
      try { actual = readFileSync(target, "utf8"); } catch { /* Report missing files as stale. */ }
      if (actual !== body) throw new Error(`${name} is stale; run npm run generate:llms`);
    } else replaceArtifact(target, body);
  }
  console.log(check ? "LLM artifacts are current" : "Updated LLM artifacts");
}
