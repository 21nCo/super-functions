#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";

const here = dirname(fileURLToPath(import.meta.url));
const cwd = resolve(here, "..");
const staticDir = resolve(cwd, "static");

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

const siteTitle = manifest.site?.title ?? config.site?.name ?? "filefn";
const siteDescription =
  manifest.site?.description ??
  config.site?.tagline ??
  "Self-hosted file uploads, storage, and processing for TypeScript, Python, and Swift.";
const canonicalUrl =
  (config.site && (config.site.canonicalUrl || config.site.url)) ||
  "https://docs.filefn.dev";

const pages = Object.values(manifest.pages)
  .filter((page) => (page.id ?? "").startsWith("docs:"))
  .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));

const docsPages = pages.filter((page) => !page.frontmatter?.draft);

function relativeUrl(page) {
  const rawPath = page.path ?? "";
  const trimmed = rawPath.replace(/^\/+|\/+$/g, "");
  return `${canonicalUrl.replace(/\/+$/, "")}/${trimmed}`;
}

const sections = [];
sections.push(`# ${siteTitle}\n`);
sections.push(`> ${siteDescription}\n`);
sections.push(`## Docs\n`);
for (const page of docsPages) {
  const title = page.title ?? page.slug ?? page.path;
  const description = page.description ?? "";
  const url = relativeUrl(page);
  sections.push(`- [${title}](${url})${description ? `: ${description}` : ""}`);
}
sections.push("");
const llmsTxt = sections.join("\n");

const fullSections = [];
fullSections.push(`# ${siteTitle}\n`);
fullSections.push(`> ${siteDescription}\n`);
for (const page of docsPages) {
  const title = page.title ?? page.slug ?? page.path;
  const url = relativeUrl(page);
  fullSections.push(`\n---\n`);
  fullSections.push(`# ${title}\n`);
  fullSections.push(`Source: ${url}\n`);
  if (page.description) {
    fullSections.push(`\n${page.description}\n`);
  }
  if (page.body) {
    fullSections.push("");
    fullSections.push(page.body.trim());
    fullSections.push("");
  }
}
const llmsFullTxt = fullSections.join("\n");

mkdirSync(staticDir, { recursive: true });
writeFileSync(resolve(staticDir, "llms.txt"), llmsTxt, "utf8");
writeFileSync(resolve(staticDir, "llms-full.txt"), llmsFullTxt, "utf8");

console.log(
  `Wrote ${resolve(staticDir, "llms.txt")} (${Buffer.byteLength(llmsTxt, "utf8")} bytes)`
);
console.log(
  `Wrote ${resolve(staticDir, "llms-full.txt")} (${Buffer.byteLength(llmsFullTxt, "utf8")} bytes)`
);
