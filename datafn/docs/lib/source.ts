import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";

const mdxSource = docs.toFumadocsSource();
const rawFiles = (mdxSource as { files: unknown }).files;
const files = typeof rawFiles === "function" ? rawFiles() : rawFiles;

export const source = loader({
  baseUrl: "/docs",
  source: {
    files,
  },
  pageTree: {
    attachFile(node, file) {
      const sidebarTitle = (file?.data as { sidebarTitle?: string } | undefined)
        ?.sidebarTitle;
      if (sidebarTitle) {
        node.name = sidebarTitle;
      }
      return node;
    },
  },
});
