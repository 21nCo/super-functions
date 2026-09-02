import { Transaction, createMdfn, type EditorController } from "@mdfn/facade";

export const INITIAL_MARKDOWN = `# Product launch brief

MDFN keeps the Markdown source authoritative while every editing surface stays in sync.

> Edit this brief, switch modes, attach a file, and move it through review.

## Launch checklist

- [x] Confirm the shared document model
- [ ] Review the framework integration
- [ ] Publish the final brief

## Ownership

| Surface | Owner | Status |
| --- | --- | --- |
| Authoring | Product | Active |
| Review | Editorial | Draft |

Learn more in the [MDFN package documentation](https://github.com/21nCo/super-functions/tree/next/mdfn).
`;

export function createExampleController(): EditorController {
  return createMdfn({ markdown: INITIAL_MARKDOWN });
}

export function resetExample(controller: EditorController): void {
  const current = controller.getState().markdown;
  controller.dispatch(
    new Transaction()
      .replaceSource(0, current.length, INITIAL_MARKDOWN)
      .setSelection(null)
      .setSidecar(undefined)
      .withSource("example:reset"),
  );
  controller.markSaved();
}

export async function markdownForFiles(files: readonly File[]): Promise<string | undefined> {
  if (files.length === 0) return undefined;
  return files
    .map((file) => `\n[${file.name}](https://assets.example.test/${encodeURIComponent(file.name)})`)
    .join("");
}

export type ExampleMode = "visual" | "source" | "split" | "preview" | "read-only";
