import { describe, expect, it } from "vitest";
import { isMarkdownContent, markdownContent, migrateToMarkdownContent } from "./index";
describe("markdown content", () => {
  it("is explicit and persists its parsing profile", () => {
    const content = markdownContent("# x");
    expect(isMarkdownContent(content)).toBe(true);
    expect(content).toMatchObject({ version: 1, profile: { dialect: "gfm", allowRawHtml: false, schemaVersion: 1 } });
  });
  it("migrates strings exactly and reports lossy rich-text blocks", () => {
    expect(migrateToMarkdownContent("# exact")).toMatchObject({ content: { markdown: "# exact" }, lossy: false });
    const result = migrateToMarkdownContent([{ type: "widget", value: 1 }]);
    expect(result.lossy).toBe(true);
    expect(result.content.markdown).toContain("mdfn-migration-opaque");
  });
  it("keeps unsupported migration payloads inert and handles non-JSON values", () => {
    const circular: Record<string, unknown> = { type: "widget", value: "--> <script>alert(1)</script>" };
    circular.self = circular;
    const result = migrateToMarkdownContent([circular, 1n]);
    expect(result.lossy).toBe(true);
    expect(result.content.markdown).not.toContain("<script>");
    expect(result.content.markdown).not.toContain("--> <");
    expect(result.content.markdown.match(/mdfn-migration-opaque/g)).toHaveLength(2);
  });

  it("retains unsupported and cyclic descendants of supported rich-text blocks", () => {
    const cyclic: Record<string, unknown> = { type: "widget" };
    cyclic.children = [cyclic];
    const result = migrateToMarkdownContent([{ type: "paragraph", children: [{ text: "kept" }, { type: "widget", value: 1 }, cyclic] }]);
    expect(result.lossy).toBe(true);
    expect(result.content.markdown).toContain("kept");
    expect(result.content.markdown.match(/mdfn-migration-opaque/g)?.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics[0]?.code).toBe("MDFN_CONTENT_RICHTEXT_LOSSY");
  });

  it("rejects malformed optional envelope fields", () => {
    const valid = markdownContent("text");
    expect(isMarkdownContent({ ...valid, schemaHash: 1 })).toBe(false);
    expect(isMarkdownContent({ ...valid, sidecar: { comments: "invalid" } })).toBe(false);
    expect(isMarkdownContent({ ...valid, sidecar: { comments: [{ id: "thread", anchor: { from: 0, to: 99 }, resolved: false, messages: [] }] } })).toBe(false);
  });

  it("omits invalid legacy metadata and returns a valid lossy migration", () => {
    const result = migrateToMarkdownContent({
      type: "text/markdown",
      markdown: "text",
      schemaHash: 1,
      sidecar: { comments: [{ id: "thread", anchor: { from: 0, to: 99 }, resolved: false, messages: [] }] },
    });

    expect(result).toMatchObject({
      content: { markdown: "text", schemaHash: undefined, sidecar: undefined },
      lossy: true,
    });
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "MDFN_CONTENT_MIGRATED_LEGACY_MARKDOWN",
      "MDFN_CONTENT_LEGACY_METADATA_DROPPED",
    ]);
    expect(isMarkdownContent(result.content)).toBe(true);
  });
});
