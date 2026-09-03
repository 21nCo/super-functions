import { describe, expect, it } from "vitest";
import { resolveExtensions } from "@mdfn/core";
import { parseMarkdown, serializeMarkdown } from "@mdfn/markdown";
import { renderHtml } from "@mdfn/render";
import { certifyExtension } from "@mdfn/testing";
import { calloutExtension, commonmarkExtension, createDirectiveExtension } from "./index";

describe("@mdfn/extensions", () => {
  it("runs one custom extension through parse, edit, serialize, render, diagnose, and migrate", () => {
    const note = createDirectiveExtension({ name: "note", label: "Note" });
    const extensions = [commonmarkExtension, note];
    const source = "Before.\n\n:::note Important\nKeep this.\n:::\n\nAfter.\n";
    const parsed = parseMarkdown(source, { extensions });
    const directive = parsed.document.content.find((node) => node.type === "directive-note");
    expect(directive?.text).toBe("Keep this.");
    expect(directive?.source?.raw).toBe(":::note Important\nKeep this.\n:::\n");
    const unchanged = serializeMarkdown({ document: parsed.document, originalSource: source, options: { extensions } });
    expect(unchanged.markdown).toBe(source);
    const editedDirective = { ...directive!, text: "Changed.", source: directive?.source ? { ...directive.source, dirty: true } : undefined };
    const editedDocument = { ...parsed.document, content: parsed.document.content.map((node) => node === directive ? editedDirective : node) };
    expect(serializeMarkdown({ document: editedDocument, originalSource: source, options: { extensions } }).markdown).toContain("Changed.");
    const fencedDirective = { ...editedDirective, text: "Before\n:::\nAfter" };
    const fencedDocument = { ...parsed.document, content: parsed.document.content.map((node) => node === directive ? fencedDirective : node) };
    const fenced = serializeMarkdown({ document: fencedDocument, originalSource: source, options: { extensions } }).markdown;
    expect(fenced).toContain("::::note Important\nBefore\n:::\nAfter\n::::");
    expect(parseMarkdown(fenced, { extensions }).document.content.find((node) => node.type === "directive-note")?.text).toBe("Before\n:::\nAfter");
    expect(renderHtml(editedDocument, { extensions }).html).toContain('data-md-directive="note"');
    const empty = { ...editedDocument, content: editedDocument.content.map((node) => node.type === "directive-note" ? { ...node, text: "" } : node) };
    expect(note.diagnostics?.(empty).map((entry) => entry.code)).toContain("MDFN_DIRECTIVE_EMPTY");
    const legacy = { ...parsed.document, content: [{ ...directive!, type: "callout-note" }] };
    expect(note.migrations?.[0].migrate(legacy).content[0].type).toBe("directive-note");
    expect(certifyExtension(note, { id: "directive-note", source, options: { extensions: [commonmarkExtension] } })).toMatchObject({ ok: true, failed: 0 });
  });

  it("parses callout directives across lone carriage returns", () => {
    const parsed = parseMarkdown(":::callout\rBody\r:::\rAfter\r", { extensions: [commonmarkExtension, calloutExtension] });
    expect(parsed.document.content.map((node) => node.type)).toEqual(["directive-callout", "paragraph"]);
    expect(parsed.document.content[1].content?.[0]?.text).toBe("After");
  });

  it("does not claim directive-like text inside fenced or indented code", () => {
    const parsed = parseMarkdown("```md\n:::callout\ninside\n:::\n```\n\n    :::callout\n\nAfter\n", { extensions: [commonmarkExtension, calloutExtension] });
    expect(parsed.document.content.map((node) => node.type)).toEqual(["codeBlock", "codeBlock", "paragraph"]);
    expect(parsed.document.content).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "directive-callout" })]));
  });

  it("preserves resolved fixture dependencies during extension certification", () => {
    const result = certifyExtension(calloutExtension, {
      id: "directive-callout",
      source: ":::callout\nBody\n:::\n",
      options: { extensions: resolveExtensions([commonmarkExtension]) },
    });
    expect(result.findings.map((finding) => finding.code)).not.toContain("MDFN_CERT_LIFECYCLE_EXCEPTION");
    expect(result.ok).toBe(true);
  });
});
