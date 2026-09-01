export * from "@mdfn/core";
export * from "@mdfn/markdown";
export * from "@mdfn/render";
export * from "@mdfn/extensions";

import { createEditor, type CreateEditorInput, type EditorController } from "@mdfn/core";
import { createMarkdownProjector, type MarkdownOptions } from "@mdfn/markdown";
import { commonmarkExtension, defaultExtensions } from "@mdfn/extensions";

export function createMdfn(
  input: Omit<CreateEditorInput, "projector" | "extensions"> & { readonly markdownOptions?: MarkdownOptions },
): EditorController {
  const configured = input.markdownOptions?.extensions;
  const extensions = configured
    ? ("schemaHash" in configured ? configured.extensions : configured)
    : input.markdownOptions?.dialect === "commonmark" ? [commonmarkExtension] : defaultExtensions;
  return createEditor({
    ...input,
    projector: createMarkdownProjector({ ...input.markdownOptions, extensions }),
    extensions,
  });
}

export const MDFN_VERSION = "0.1.0" as const;
