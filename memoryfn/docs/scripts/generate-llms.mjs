#!/usr/bin/env node
import { withSourceLinks, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";
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

artifacts.llmsTxt = withSourceLinks(artifacts.llmsTxt, manifest, "memoryfn", config.site?.canonicalUrl);
artifacts.llmsFullTxt = withSourceLinks(artifacts.llmsFullTxt, manifest, "memoryfn", config.site?.canonicalUrl);

artifacts.llmsFullTxt = artifacts.llmsFullTxt.replace("For programmatic access, prefer the MCP server\nor the structured manifest emitted alongside this file.", "For a page index, see /docs/llms.txt.");
writeLlmsArtifacts(staticDir, artifacts);
