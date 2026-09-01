import { describe, expect, it } from "vitest";
import { createEditor } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { transactionFromAiEdit } from "./index";
describe("AI edit boundary", () => {
  it("rejects edits outside policy", () => {
    const controller = createEditor({ markdown: "abcd", projector: createMarkdownProjector() });
    expect(() => transactionFromAiEdit(controller, { from: 0, to: 2, replacement: "x" }, { allowedRange: { from: 2, to: 4 } })).toThrow("MDFN_AI_EDIT_OUTSIDE_ALLOWED_RANGE");
  });

  it("rejects non-string replacements before constructing a transaction", () => {
    const controller = createEditor({ markdown: "abcd", projector: createMarkdownProjector() });
    expect(() => transactionFromAiEdit(controller, { from: 0, to: 1, replacement: { unsafe: true } } as never))
      .toThrow("MDFN_AI_EDIT_REPLACEMENT_INVALID");
  });
});
