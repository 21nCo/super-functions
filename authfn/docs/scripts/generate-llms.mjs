#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { fileURLToPath } from "node:url";
import { buildLlmsSiteArtifacts, withSourceLinks, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentOrigin = process.env.CLOUDFLARE_DOCS_DEPLOY === "1"
  ? process.env.CLOUDFLARE_DOCS_PUBLIC_ORIGIN || undefined
  : undefined;
const { artifacts, manifest, canonicalUrl } = await buildLlmsSiteArtifacts(cwd, {
  buildLlmsTxtArtifacts, buildManifest, loadDocsConfig, FsContentProvider,
}, { canonicalUrl: deploymentOrigin });
artifacts.llmsTxt = withSourceLinks(artifacts.llmsTxt, manifest, "authfn", canonicalUrl);
artifacts.llmsFullTxt = withSourceLinks(artifacts.llmsFullTxt, manifest, "authfn", canonicalUrl);
writeLlmsArtifacts(resolve(cwd, "static"), artifacts);
