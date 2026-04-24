import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import type { SourceConfig, VirtualFile } from "fumadocs-core/source";

const fumadocsSource = docs.toFumadocsSource();

type FumadocsSourceLike = {
  files: VirtualFile<SourceConfig>[] | (() => VirtualFile<SourceConfig>[]);
};

function getSourceFiles(source: FumadocsSourceLike): VirtualFile<SourceConfig>[] {
  return typeof source.files === "function" ? source.files() : source.files;
}

export const source = loader({
  baseUrl: "/docs",
  source: {
    files: getSourceFiles(fumadocsSource as FumadocsSourceLike),
  },
});
