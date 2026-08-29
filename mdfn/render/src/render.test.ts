import { describe, expect, it } from "vitest";
import { extractChunks, extractDocument, extractHeadings, extractLinks, renderHtml, type RenderPolicy } from "./index";
import type { MdfnDocument, MdfnExtension } from "@mdfn/core";

const document: MdfnDocument = {
  type: "doc",
  schemaVersion: 1,
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Security" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Open " },
      { type: "link", attrs: { url: "https://example.com" }, content: [{ type: "text", text: "safe" }] },
      { type: "text", text: " or " },
      { type: "link", attrs: { url: "javascript:alert(1)" }, content: [{ type: "text", text: "unsafe" }] },
      { type: "link", attrs: { url: "java\nscript:alert(1)" }, content: [{ type: "text", text: "obfuscated" }] },
      { type: "link", attrs: { url: "\\\\evil.example/path" }, content: [{ type: "text", text: "backslash" }] },
    ] },
    { type: "opaque", attrs: { syntax: "html" }, text: "<img src=x onerror=bad()>" },
  ],
};

describe("@mdfn/render", () => {
  it("escapes raw content and blocks unsafe navigation by default", () => {
    const result = renderHtml(document);
    expect(result.html).toContain('rel="noreferrer noopener"');
    expect(result.html).toContain('data-mdfn-blocked-link="true"');
    expect(result.html).not.toContain("java\nscript");
    expect(result.html).not.toContain("evil.example");
    expect(result.html).toContain("&lt;img src=x onerror=bad()&gt;");
    expect(result.diagnostics.map((entry) => entry.code)).toContain("MDFN_UNSAFE_URL_BLOCKED");
  });

  it("requires a sanitizer before opt-in raw HTML rendering", () => {
    expect(() => renderHtml(document, { rawHtml: { enabled: true } })).toThrowError("MDFN_RAW_HTML_SANITIZER_REQUIRED");
    const policy: RenderPolicy = { rawHtml: { enabled: true, sanitize: () => "<p>sanitized</p>" } };
    expect(renderHtml(document, policy).html).toContain("<p>sanitized</p>");
  });

  it("exposes deterministic search projections", () => {
    expect(extractHeadings(document)[0]).toMatchObject({ level: 2, text: "Security" });
    expect(extractLinks(document)).toHaveLength(4);
    expect(extractChunks(document)[0]).toMatchObject({ heading: "Security" });
  });

  it("accepts only structured, policy-checked extension output", () => {
    const safe: MdfnExtension = {
      name: "safe-render",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "touched-region", unsupported: "opaque" },
      render: ({ node }) => node.type === "heading" ? { tag: "aside", attrs: { class: "safe" }, children: [{ tag: "strong", text: "Rendered" }] } : null,
    };
    expect(renderHtml(document, { extensions: [safe] }).html).toContain('<aside class="safe"><strong>Rendered</strong></aside>');
    const malicious = {
      ...safe,
      name: "malicious-render",
      render: ({ node }: { node: MdfnDocument }) => node.type === "doc" ? null : "<img src=x onerror=alert(1)><script>alert(2)</script>",
    } as unknown as MdfnExtension;
    expect(() => renderHtml(document, { extensions: [malicious] })).toThrowError("MDFN_EXTENSION_RENDER_RESULT_INVALID");
  });

  it("forces noopener on extension links that open a new browsing context", () => {
    const extension: MdfnExtension = {
      name: "safe-blank-link",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" },
      render: ({ node }) => node.type === "heading" ? { tag: "a", attrs: { href: "https://example.com", target: "_blank", rel: "opener" }, text: "Open" } : null,
    };
    const html = renderHtml(document, { extensions: [extension] }).html;
    expect(html).toContain('target="_blank" rel="noreferrer noopener"');
    expect(html).not.toContain('rel="opener"');
  });

  it("enforces node limits for manually rendered empty list items", () => {
    const list: MdfnDocument = {
      type: "doc",
      schemaVersion: 1,
      content: [{ type: "list", content: [{ type: "listItem", content: [] }, { type: "listItem", content: [] }] }],
    };
    expect(() => renderHtml(list, { maxNodes: 2 })).toThrowError("MDFN_RENDER_NODE_LIMIT_EXCEEDED:2");
  });

  it("splits oversized single blocks into bounded extraction chunks", () => {
    const long: MdfnDocument = {
      type: "doc",
      schemaVersion: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(150) }] }],
    };

    expect(extractChunks(long, 64).map((chunk) => chunk.text.length)).toEqual([64, 64, 22]);
    expect(extractDocument(long, { maxChunkLength: 64 }).chunks.map((chunk) => chunk.text.length)).toEqual([64, 64, 22]);
  });
});
