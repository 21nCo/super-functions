#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { buildLlmsSiteArtifacts, withSourceLinks, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentOrigin = process.env.CLOUDFLARE_DOCS_DEPLOY === "1"
  ? process.env.CLOUDFLARE_DOCS_PUBLIC_ORIGIN ?? ""
  : undefined;
const { artifacts, manifest, canonicalUrl } = await buildLlmsSiteArtifacts(cwd, {
  buildLlmsTxtArtifacts, buildManifest, loadDocsConfig, FsContentProvider,
}, { canonicalUrl: deploymentOrigin });
const sourceRef = process.env.DOCS_SOURCE_REF ?? "dev";
artifacts.llmsTxt = withSourceLinks(artifacts.llmsTxt, manifest, "secfn", canonicalUrl, sourceRef);
artifacts.llmsFullTxt = withSourceLinks(artifacts.llmsFullTxt, manifest, "secfn", canonicalUrl, sourceRef);
const generatedFooter = "For programmatic access, prefer the MCP server\nor the structured manifest emitted alongside this file.";
if (!artifacts.llmsFullTxt.includes(generatedFooter)) {
  throw new Error("Unexpected DocsFn llms-full footer; review the generated artifact before publishing");
}
const indexUrl = canonicalUrl
  ? `${canonicalUrl.replace(/\/$/, "")}/docs/llms.txt`
  : `https://github.com/21nCo/super-functions/blob/${encodeURIComponent(sourceRef)}/secfn/docs/static/llms.txt`;
artifacts.llmsFullTxt = artifacts.llmsFullTxt.replace(generatedFooter, `For a page index, see ${indexUrl}.`);
writeLlmsArtifacts(resolve(cwd, "static"), artifacts);
