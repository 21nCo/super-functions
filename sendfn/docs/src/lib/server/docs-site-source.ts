import docsConfig from "../../../docsfn.config";
import { createDocsSiteRuntime } from "../../../../../scripts/docs-site/runtime";

const content = import.meta.glob("../../../content/**/*.{md,mdx,json,yaml,yml}", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const assets = import.meta.glob("../../../static/**/*.{txt,json,yaml,yml,md,mdx}", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

export const {
  loadDocsSiteSource,
  getCompiledDocsPage,
} = createDocsSiteRuntime(docsConfig, content, assets);
