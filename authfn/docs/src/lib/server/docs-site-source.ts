import docsConfig from "../../../docsfn.config";
import { createDocsSiteRuntime } from "../../../../../scripts/docs-site/runtime";

const content = import.meta.glob("../../../content/**/*", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const assets = import.meta.glob("../../../static/**/*.{txt,json,yaml,yml,md,mdx}", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

export type {
  DocsSiteSource,
  DocsSiteCompiledCacheSummary,
} from "../../../../../scripts/docs-site/runtime";

export const {
  loadDocsSiteSource,
  getCompiledDocsPage,
  getCompiledDocsPost,
  getDocsSiteCompiledCacheSummary,
  createDocsSiteSearchRuntime,
} = createDocsSiteRuntime(docsConfig, content, assets);
