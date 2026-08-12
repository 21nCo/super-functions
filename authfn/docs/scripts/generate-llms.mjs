#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
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

const artifacts = buildLlmsTxtArtifacts(manifest, {
  canonicalUrl: config.site?.canonicalUrl,
  includeBlog: false,
});

mkdirSync(staticDir, { recursive: true });
writeFileSync(resolve(staticDir, "llms.txt"), artifacts.llmsTxt, "utf8");
writeFileSync(resolve(staticDir, "llms-full.txt"), artifacts.llmsFullTxt, "utf8");

console.log(
  `Wrote ${resolve(staticDir, "llms.txt")} (${Buffer.byteLength(artifacts.llmsTxt, "utf8")} bytes)`
);
console.log(
  `Wrote ${resolve(staticDir, "llms-full.txt")} (${Buffer.byteLength(artifacts.llmsFullTxt, "utf8")} bytes)`
);
