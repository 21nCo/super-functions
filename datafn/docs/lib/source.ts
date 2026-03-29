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
});
