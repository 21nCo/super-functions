import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@mdfn/markdown";
import { createSearchRecords } from "./index";

describe("search records", () => {
  it("uses canonical extraction", () => expect(createSearchRecords("d", parseMarkdown("# H\n\nBody").document)[0]?.text).toContain("Body"));

  it("namespaces document and chunk identities without cross-document collisions", () => {
    const document = parseMarkdown("# H\n\nBody").document;
    const ids = [
      ...createSearchRecords("article", document).map((record) => record.id),
      ...createSearchRecords("article:chunk:0", document).map((record) => record.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
