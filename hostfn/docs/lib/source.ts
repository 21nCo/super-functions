import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";

const fumadocsSource = docs.toFumadocsSource();
const rawFiles = (fumadocsSource as { files: unknown }).files;
const files = typeof rawFiles === "function" ? rawFiles() : rawFiles;

export const source = loader({
  baseUrl: "/docs",
  source: {
    files,
  },
});
