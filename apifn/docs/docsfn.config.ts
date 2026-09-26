import type { DocsConfig } from "@docsfn/core";

const config: DocsConfig = {
  schemaVersion: 1,
  site: {
    canonicalUrl: "https://apifn.com",
    title: "ApiFn",
    description: "Generate, test, mock, diff, and document APIs from one OpenAPI contract.",
    basePath: "/docs",
    editLink: { pattern: "https://github.com/21nCo/super-functions/edit/dev/apifn/docs/{path}" },
  },
  compat: { preset: "none" },
  content: {
    root: ".",
    docsDir: "content/docs",
    pagesDir: "content/pages",
    blogDir: "content/blog",
    apiDir: "content/api",
    assetsDir: "static",
    metaFileName: "meta.json",
  },
  navigation: {
    topNav: [
      { label: "Docs", href: "/docs" },
      { label: "Packages", href: "/docs/reference" },
      { label: "GitHub", href: "https://github.com/21nCo/super-functions/tree/dev/apifn", external: true },
    ],
    sidebars: {
      docs: { title: "Documentation", root: true, include: ["docs/**"] },
    },
  },
  search: { enabled: true, scopes: ["docs"], bodyIndexing: "summary" },
  auth: { enabled: false, mode: "public" },
  analytics: { enabled: false, provider: "watchfn", respectDnt: true },
};

export default config;
