import { describe, expect, it } from "vitest";
import type { MdfnExtension } from "@mdfn/core";
import { formatMarkdown, parseMarkdown, serializeMarkdown } from "./index";

describe("@mdfn/markdown", () => {
  const source = "# Hello  \r\n\r\nA **bold** paragraph.\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n<div onclick=\"bad()\">raw</div>\r\n";

  it("provides byte-identical no-edit preservation with GFM and opaque HTML", () => {
    const parsed = parseMarkdown(source);
    const result = serializeMarkdown({ document: parsed.document, originalSource: source });
    expect(result.markdown).toBe(source);
    expect(result.preservation.exactUntouched).toBe(true);
    expect(parsed.document.content.some((node) => node.type === "table")).toBe(true);
    expect(parsed.document.content.some((node) => node.type === "opaque")).toBe(true);
    expect(parsed.diagnostics.some((entry) => entry.code === "MDFN_RAW_HTML_DISABLED")).toBe(true);
  });

  it("normalizes only a dirty top-level region", () => {
    const parsed = parseMarkdown(source);
    const paragraphIndex = parsed.document.content.findIndex((node) => node.type === "paragraph");
    const paragraph = parsed.document.content[paragraphIndex];
    const content = [...(paragraph.content ?? [])];
    content.push({ type: "text", text: " Added." });
    const document = {
      ...parsed.document,
      content: parsed.document.content.map((node, index) => index === paragraphIndex
        ? { ...paragraph, content, source: paragraph.source ? { ...paragraph.source, dirty: true } : undefined }
        : node),
    };
    const result = serializeMarkdown({ document, originalSource: source });
    expect(result.markdown.startsWith("# Hello  \r\n")).toBe(true);
    expect(result.markdown).toContain("Added.");
    expect(result.markdown).toContain("<div onclick=\"bad()\">raw</div>");
    expect(result.preservation.touchedRegionOnly).toBe(true);
  });

  it("enforces resource limits and supports explicit formatting", () => {
    expect(() => parseMarkdown("12345", { maxBytes: 4 })).toThrowError(/MDFN_SOURCE_TOO_LARGE/);
    expect(() => parseMarkdown(`${"> ".repeat(32)}deep`, { maxDepth: 8 })).toThrowError(/MDFN_DEPTH_LIMIT_EXCEEDED:8/);
    expect(() => parseMarkdown("***many*** nodes", { maxNodes: 4 })).toThrowError(/MDFN_NODE_LIMIT_EXCEEDED:4/);
    expect(formatMarkdown("# title\n\ntext").markdown).toContain("# title");
  });

  it("rejects the node budget before running extension diagnostics", () => {
    let diagnosed = false;
    const extension: MdfnExtension = {
      name: "budget-observer",
      version: "1.0.0",
      diagnostics: () => {
        diagnosed = true;
        return [];
      },
      preservation: { noEdit: "exact", edited: "touched-region", unsupported: "opaque" },
    };

    expect(() => parseMarkdown("**one** *two* ~~three~~", { maxNodes: 4, extensions: [extension] }))
      .toThrowError(/MDFN_NODE_LIMIT_EXCEEDED:4/);
    expect(diagnosed).toBe(false);
  });

  it("keeps opted-in raw HTML opaque without a disabled-policy diagnostic", () => {
    const parsed = parseMarkdown("<section>safe only after host sanitation</section>\n", { allowRawHtml: true });
    expect(parsed.document.content[0]).toMatchObject({ type: "opaque", attrs: { syntax: "html" } });
    expect(parsed.diagnostics.map((entry) => entry.code)).not.toContain("MDFN_RAW_HTML_DISABLED");
  });

  it("treats lone carriage returns as token boundaries", () => {
    expect(parseMarkdown("one\rtwo\rthree\r", { maxTokenLength: 5 }).lineEnding).toBe("cr");
  });

  it("preserves unknown directives and disabled frontmatter as exact opaque source", () => {
    const directive = ":::future key=value\nbody\n:::\n\nAfter.\n";
    const parsedDirective = parseMarkdown(directive);
    expect(parsedDirective.document.content[0]).toMatchObject({ type: "opaque", attrs: { syntax: "directive/future" } });
    expect(parsedDirective.document.content[0].source?.raw).toBe(":::future key=value\nbody\n:::\n");
    expect(parsedDirective.diagnostics.map((entry) => entry.code)).toContain("MDFN_EXTENSION_DISABLED_OR_UNKNOWN");
    expect(serializeMarkdown({ document: parsedDirective.document, originalSource: directive }).markdown).toBe(directive);

    const frontmatter = "---\ntitle: Exact\n---\n\n# Heading\n";
    const parsedFrontmatter = parseMarkdown(frontmatter);
    expect(parsedFrontmatter.document.content[0]).toMatchObject({ type: "opaque", attrs: { syntax: "frontmatter" } });
    expect(formatMarkdown(frontmatter).markdown).toContain("---\ntitle: Exact\n---");
  });

  it("diagnoses unsafe URLs while preserving their recoverable source value", () => {
    const parsed = parseMarkdown("[unsafe](java%0ascript:alert(1))\n");
    expect(parsed.diagnostics.map((entry) => entry.code)).toContain("MDFN_UNSAFE_URL");
    expect(parsed.document.content[0].content?.[0].attrs?.url).toBe("java%0ascript:alert(1)");
  });

  it("resolves reference links into editable semantic nodes while retaining reference syntax", () => {
    const source = "[label][ref]\n\n[ref]: https://example.com \"Title\"\n";
    const parsed = parseMarkdown(source, { dialect: "commonmark" });
    expect(parsed.document.content[0].content?.[0]).toMatchObject({
      type: "link",
      attrs: { url: "https://example.com", referenceIdentifier: "ref", referenceType: "full" },
    });
    expect(parsed.document.content[1]).toMatchObject({ type: "definition", attrs: { identifier: "ref" } });
    expect(serializeMarkdown({ document: parsed.document, originalSource: source, options: { dialect: "commonmark" } }).markdown).toBe(source);
  });

  it("keeps the first duplicate reference definition authoritative", () => {
    const parsed = parseMarkdown("[label][ref]\n\n[ref]: https://first.example\n[ref]: https://second.example\n", { dialect: "commonmark" });
    expect(parsed.document.content[0].content?.[0]).toMatchObject({
      type: "link",
      attrs: { url: "https://first.example" },
    });
  });

  it("recognizes durable asset identifiers before generic URL rejection", () => {
    const source = "![asset](mdfn-asset:filefn/asset-1?document=doc&version=v1)";
    const parsed = parseMarkdown(source);
    expect(parsed.document.content[0].content?.[0]).toMatchObject({ type: "asset", attrs: { provider: "filefn", id: "asset-1", documentId: "doc", versionId: "v1" } });
    expect(parsed.diagnostics.map((entry) => entry.code)).not.toContain("MDFN_UNSAFE_URL");
  });
});
