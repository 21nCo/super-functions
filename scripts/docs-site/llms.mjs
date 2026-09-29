import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Resolve DocsFn from the consumer site so each site's published package pin is honored.
 * @param {string} cwd
 * @param {{buildManifest: Function, loadDocsConfig: Function, FsContentProvider: new (options: object) => object}} dependencies
 */
export async function loadLlmsSiteSource(cwd, dependencies) {
  const { buildManifest, loadDocsConfig, FsContentProvider } = dependencies;
  const config = await loadDocsConfig({ cwd });
  const provider = new FsContentProvider({
    root: config.content.root || cwd,
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
export async function buildLlmsSiteArtifacts(cwd, dependencies) {
  const { config, manifest } = await loadLlmsSiteSource(cwd, dependencies);
  const { buildLlmsTxtArtifacts } = dependencies;
  const artifacts = buildLlmsTxtArtifacts(manifest, {
    canonicalUrl: config.site?.canonicalUrl,
    includeBlog: false,
  });
  return { artifacts, config, manifest };
}

export function rewriteAuthfnBoilerplate(artifacts) {
  const expected = "For programmatic access, prefer the MCP server\nor the structured manifest emitted alongside this file.";
  if (!artifacts.llmsFullTxt.includes(expected)) {
    throw new Error("Expected DocsFn LLM boilerplate was not found; review the generator output.");
  }
  artifacts.llmsFullTxt = artifacts.llmsFullTxt.replace(expected, "For a page index, see /docs/llms.txt.");
  return artifacts;
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
    .map((page) => [page.path, page.id.slice("docs:".length)]));
  return text.replace(/\]\((\/docs[^\s)]*)\)/g, (match, href) => {
    const url = new URL(href, "https://docs.invalid");
    const source = sources.get(url.pathname);
    if (!source) return match;
    const path = source.split("/").map(encodeURIComponent).join("/");
    return `](https://github.com/21nCo/super-functions/blob/dev/${product}/docs/content/docs/${path}${url.hash})`;
  });
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
    } else writeFileSync(target, body, "utf8");
  }
  console.log(check ? "LLM artifacts are current" : "Updated LLM artifacts");
}
