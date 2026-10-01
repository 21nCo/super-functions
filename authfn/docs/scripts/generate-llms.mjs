#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { fileURLToPath } from "node:url";
import { buildLlmsSiteArtifacts, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { artifacts } = await buildLlmsSiteArtifacts(cwd, {
  buildLlmsTxtArtifacts, buildManifest, loadDocsConfig, FsContentProvider,
}, { canonicalUrl: process.env.CLOUDFLARE_DOCS_DEPLOY === "1"
  ? process.env.CLOUDFLARE_DOCS_PUBLIC_ORIGIN || undefined : undefined });
writeLlmsArtifacts(resolve(cwd, "static"), artifacts);
