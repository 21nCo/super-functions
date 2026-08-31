import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@mdfn/markdown";
import { isMarkdownContent, markdownContent, migrateToMarkdownContent } from "./index";

function nodeText(node: { readonly text?: string; readonly content?: readonly { readonly text?: string; readonly content?: readonly unknown[] }[] }): string {
  return (node.text ?? "") + (node.content ?? []).map((child) => nodeText(child as Parameters<typeof nodeText>[0])).join("");
}

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

  it("marks discarded rich-text leaf metadata as lossy", () => {
    const result = migrateToMarkdownContent([
      { type: "paragraph", children: [{ text: "bold", bold: true, link: "https://example.com" }] },
    ]);

    expect(result.lossy).toBe(true);
    expect(result.content.markdown).toContain("bold");
    expect(result.content.markdown).toContain("mdfn-migration-opaque");
    expect(result.diagnostics[0]?.code).toBe("MDFN_CONTENT_RICHTEXT_LOSSY");
  });

  it("retains metadata discarded from nested rich nodes with children", () => {
    const result = migrateToMarkdownContent([
      { type: "paragraph", children: [{ type: "link", url: "https://example.com", children: [{ text: "label" }] }] },
    ]);

    expect(result.lossy).toBe(true);
    expect(result.content.markdown).toContain("label");
    expect(result.content.markdown).toContain("mdfn-migration-opaque");
    expect(result.diagnostics[0]?.code).toBe("MDFN_CONTENT_RICHTEXT_LOSSY");
  });

  it("escapes projected rich text and chooses a collision-free code fence", () => {
    const result = migrateToMarkdownContent([
      { type: "paragraph", children: [{ text: "# heading *emphasis*" }] },
      { type: "code", language: "ts bad", children: [{ text: "```\nvalue" }] },
    ]);
    expect(result.content.markdown).toContain("\\# heading \\*emphasis\\*");
    expect(result.content.markdown).toContain("````tsbad\n```\nvalue\n````");
    const punctuation = migrateToMarkdownContent([
      { type: "paragraph", children: [{ text: "~~strike~~ | ![label](target) {value}." }] },
    ]);
    expect(punctuation.content.markdown).toBe("\\~\\~strike\\~\\~ \\| \\!\\[label\\]\\(target\\) \\{value\\}\\.");
  });

  it("preserves supported rich-text text semantics after Markdown parsing", () => {
    const literal = "  # literal *text* &copy; user@example.com\nsecond\tline  ";
    const result = migrateToMarkdownContent([
      { type: "paragraph", children: [{ text: literal }] },
    ]);
    const parsed = parseMarkdown(result.content.markdown);

    expect(result.lossy).toBe(false);
    expect(parsed.document.content).toHaveLength(1);
    expect(parsed.document.content[0]?.type).toBe("paragraph");
    expect(nodeText(parsed.document.content[0]!)).toBe(literal);
  });

  it("preserves text semantics for every supported rich-text block kind", () => {
    const cases = [
      { block: { type: "h2", children: [{ text: "# literal *heading*" }] }, rootType: "heading", text: "# literal *heading*" },
      { block: { type: "blockquote", children: [{ text: "> literal *quote*" }] }, rootType: "blockquote", text: "> literal *quote*" },
      { block: { type: "list-item", children: [{ text: "- literal *item*" }] }, rootType: "list", text: "- literal *item*" },
      { block: { type: "code", language: "ts", children: [{ text: "before ``` after" }] }, rootType: "codeBlock", text: "before ``` after" },
    ];

    for (const candidate of cases) {
      const result = migrateToMarkdownContent([candidate.block]);
      const parsed = parseMarkdown(result.content.markdown);
      expect(result.lossy).toBe(false);
      expect(parsed.document.content).toHaveLength(1);
      expect(parsed.document.content[0]?.type).toBe(candidate.rootType);
      expect(nodeText(parsed.document.content[0]!)).toBe(candidate.text);
    }
  });

  it("marks empty blocks and sanitized code metadata as lossy", () => {
    const empty = migrateToMarkdownContent([{ type: "paragraph", children: [] }]);
    const sanitized = migrateToMarkdownContent([
      { type: "code", language: "ts bad", children: [{ text: "value" }] },
    ]);
    const invalidMetadata = migrateToMarkdownContent([
      { type: "code", language: 42, children: [{ text: "value" }] },
    ]);

    expect(empty).toMatchObject({ lossy: true, diagnostics: [{ code: "MDFN_CONTENT_RICHTEXT_LOSSY" }] });
    expect(empty.content.markdown).toContain("mdfn-migration-opaque");
    expect(sanitized).toMatchObject({ lossy: true, diagnostics: [{ code: "MDFN_CONTENT_RICHTEXT_LOSSY" }] });
    expect(sanitized.content.markdown).toContain("```tsbad\nvalue\n```");
    expect(sanitized.content.markdown).toContain("mdfn-migration-opaque");
    expect(invalidMetadata.lossy).toBe(true);
    expect(invalidMetadata.content.markdown).toContain("mdfn-migration-opaque");
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

  it("detaches validated legacy sidecars from caller-owned objects", () => {
    const legacy = {
      type: "text/markdown",
      markdown: "text",
      sidecar: {
        assets: [{ id: "asset", mediaType: "image/png", metadata: { nested: { value: "original" } } }],
      },
    };
    const result = migrateToMarkdownContent(legacy);

    legacy.sidecar.assets[0]!.metadata.nested.value = "mutated";

    expect(result.content.sidecar?.assets?.[0]?.metadata).toEqual({ nested: { value: "original" } });
    expect(isMarkdownContent(result.content)).toBe(true);
  });
});
