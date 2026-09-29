#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { buildLlmsTxtArtifacts, buildManifest, loadDocsConfig } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { fileURLToPath } from "node:url";
import { buildLlmsSiteArtifacts, rewriteAuthfnBoilerplate, writeLlmsArtifacts } from "../../../scripts/docs-site/llms.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { artifacts } = await buildLlmsSiteArtifacts(cwd, {
  buildLlmsTxtArtifacts, buildManifest, loadDocsConfig, FsContentProvider,
});
writeLlmsArtifacts(resolve(cwd, "static"), rewriteAuthfnBoilerplate(artifacts));
