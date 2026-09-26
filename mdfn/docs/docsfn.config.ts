import type { DocsConfig } from "@docsfn/core";

const config: DocsConfig = {
  schemaVersion: 1,
  site: {
    canonicalUrl: "https://mdfn.com",
    title: "MDFN",
    description: "Markdown-native authoring with source preservation, safe rendering, and collaboration.",
    basePath: "/docs",
    editLink: { pattern: "https://github.com/21nCo/super-functions/edit/dev/mdfn/docs/{path}" },
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
      { label: "GitHub", href: "https://github.com/21nCo/super-functions/tree/dev/mdfn", external: true },
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
