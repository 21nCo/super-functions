import { describe, expect, it } from "vitest";
import { createMdfn } from "./index";

describe("mdfn facade", () => {
  it("honors CommonMark profiles without silently enabling GFM", () => {
    const controller = createMdfn({ markdown: "~~literal~~", markdownOptions: { dialect: "commonmark" } });
    expect(controller.getState().document.content[0]?.content?.[0]).toMatchObject({ type: "text", text: "~~literal~~" });
    controller.destroy();
  });
});
