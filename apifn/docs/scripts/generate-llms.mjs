#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { fileURLToPath } from "node:url";
import { buildLlmsSiteArtifacts, withSourceLinks, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { artifacts, config, manifest } = await buildLlmsSiteArtifacts(cwd, {
  buildLlmsTxtArtifacts, buildManifest, loadDocsConfig, FsContentProvider,
});
artifacts.llmsTxt = withSourceLinks(artifacts.llmsTxt, manifest, "apifn", config.site?.canonicalUrl);
artifacts.llmsFullTxt = withSourceLinks(artifacts.llmsFullTxt, manifest, "apifn", config.site?.canonicalUrl);
artifacts.llmsFullTxt = artifacts.llmsFullTxt.replace("For programmatic access, prefer the MCP server\nor the structured manifest emitted alongside this file.", "For a page index, see /docs/llms.txt.");
writeLlmsArtifacts(resolve(cwd, "static"), artifacts);
