import { inspectMdfnUrl, type MdfnDocument, type MdfnJsonValue, type MdfnNode, type SourceSpan } from "@mdfn/core";
import { Schema, type DOMOutputSpec, type Mark, type Node as PmNode, type NodeSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const sourceAttrs = {
  mdfnFrom: { default: null },
  mdfnTo: { default: null },
  mdfnRaw: { default: null },
  mdfnPreservation: { default: null },
} as const;

const attrsFromSource = (source: SourceSpan | undefined): Record<string, unknown> => ({
  mdfnFrom: source?.from ?? null,
  mdfnTo: source?.to ?? null,
  mdfnRaw: source?.raw ?? null,
  mdfnPreservation: source?.preservation ?? null,
});

const block = (spec: NodeSpec): NodeSpec => ({ ...spec, attrs: { ...sourceAttrs, ...(spec.attrs ?? {}) } });
const tables = tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {} });

export const mdfnSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: block({ content: "inline*", group: "block", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] }),
    heading: block({ attrs: { ...sourceAttrs, level: { default: 1 } }, content: "inline*", group: "block", defining: true, parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })), toDOM: (node) => [`h${node.attrs.level}`, 0] }),
    blockquote: block({ content: "block+", group: "block", defining: true, parseDOM: [{ tag: "blockquote" }], toDOM: () => ["blockquote", 0] }),
    horizontal_rule: block({ group: "block", parseDOM: [{ tag: "hr" }], toDOM: () => ["hr"] }),
    code_block: block({ attrs: { ...sourceAttrs, language: { default: "" }, meta: { default: "" } }, content: "text*", marks: "", group: "block", code: true, defining: true, parseDOM: [{ tag: "pre", preserveWhitespace: "full" }], toDOM: (node) => ["pre", ["code", node.attrs.language ? { class: `language-${node.attrs.language}` } : {}, 0]] }),
    bullet_list: block({ attrs: { ...sourceAttrs, spread: { default: false } }, content: "list_item+", group: "block", parseDOM: [{ tag: "ul" }], toDOM: () => ["ul", 0] }),
    ordered_list: block({ attrs: { ...sourceAttrs, order: { default: 1 }, spread: { default: false } }, content: "list_item+", group: "block", parseDOM: [{ tag: "ol", getAttrs: (element) => ({ order: (element as HTMLOListElement).start || 1 }) }], toDOM: (node) => node.attrs.order === 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0] }),
    list_item: { attrs: { checked: { default: null } }, content: "paragraph block*", defining: true, parseDOM: [{ tag: "li" }], toDOM: (node) => ["li", node.attrs.checked === null ? {} : { "data-checked": String(node.attrs.checked) }, 0] },
    image: { inline: true, attrs: { src: { default: "" }, sourceSrc: { default: "" }, blocked: { default: false }, alt: { default: "" }, title: { default: "" }, referenceIdentifier: { default: "" }, referenceLabel: { default: "" }, referenceType: { default: "" } }, group: "inline", draggable: true, parseDOM: [{ tag: "img[src]", getAttrs: (element) => { const image = element as HTMLImageElement; const src = image.getAttribute("src") ?? ""; return { src, sourceSrc: src, blocked: false, alt: image.getAttribute("alt") ?? "", title: image.getAttribute("title") ?? "" }; } }], toDOM: (node) => node.attrs.blocked ? ["span", { "data-mdfn-blocked-image": "true", "aria-label": node.attrs.alt || "Blocked image" }, String(node.attrs.alt || "")] : ["img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title || null }] },
    asset: { inline: true, attrs: { ...sourceAttrs, provider: { default: "" }, assetId: { default: "" }, documentId: { default: "" }, versionId: { default: "" }, sourceUrl: { default: "" }, alt: { default: "" }, title: { default: "" } }, group: "inline", atom: true, selectable: true, draggable: true, toDOM: (node) => ["span", { "data-mdfn-asset": node.attrs.assetId, "data-mdfn-provider": node.attrs.provider, contenteditable: "false" }, String(node.attrs.alt || "Asset")] },
    opaque_inline: { inline: true, attrs: { ...sourceAttrs, syntax: { default: "unknown" }, raw: { default: "" } }, group: "inline", atom: true, selectable: true, toDOM: (node) => ["code", { "data-mdfn-opaque-inline": node.attrs.syntax, contenteditable: "false" }, String(node.attrs.raw)] },
    hard_break: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
    opaque_block: block({ attrs: { ...sourceAttrs, syntax: { default: "unknown" }, raw: { default: "" } }, group: "block", atom: true, selectable: true, draggable: false, parseDOM: [{ tag: "pre[data-mdfn-opaque]", getAttrs: (element) => ({ syntax: (element as HTMLElement).dataset.mdfnOpaque, raw: element.textContent ?? "" }) }], toDOM: (node) => ["pre", { "data-mdfn-opaque": node.attrs.syntax, contenteditable: "false" }, ["code", String(node.attrs.raw)]] }),
    extension_block: block({ attrs: { ...sourceAttrs, nodeType: { default: "unknown" }, nodeAttrs: { default: "{}" }, nodeContent: { default: "[]" }, raw: { default: "" }, text: { default: "" } }, group: "block", atom: true, selectable: true, draggable: false, parseDOM: [{ tag: "aside[data-mdfn-extension]", getAttrs: (element) => ({ nodeType: (element as HTMLElement).dataset.mdfnExtension ?? "unknown", raw: (element as HTMLElement).dataset.mdfnRaw ?? "", text: element.textContent ?? "" }) }], toDOM: (node) => ["aside", { "data-mdfn-extension": node.attrs.nodeType, "data-mdfn-raw": node.attrs.raw, contenteditable: "false" }, ["strong", String(node.attrs.nodeType)], node.attrs.text ? ["pre", String(node.attrs.text)] : ["span", "Opaque extension block"]] }),
    table: { ...tables.table, attrs: { ...sourceAttrs, ...(tables.table.attrs ?? {}), mdfnAlign: { default: [] } } },
    table_row: tables.table_row,
    table_cell: tables.table_cell,
    table_header: tables.table_header,
    text: { group: "inline" },
  },
  marks: {
    strong: { parseDOM: [{ tag: "strong" }, { tag: "b", getAttrs: (element) => (element as HTMLElement).style.fontWeight !== "normal" && null }], toDOM: () => ["strong", 0] },
    em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
    code: { parseDOM: [{ tag: "code" }], toDOM: () => ["code", 0] },
    link: { attrs: { href: { default: "" }, sourceHref: { default: "" }, blocked: { default: false }, title: { default: "" }, referenceIdentifier: { default: "" }, referenceLabel: { default: "" }, referenceType: { default: "" } }, inclusive: false, parseDOM: [{ tag: "a[href]", getAttrs: (element) => { const href = (element as HTMLAnchorElement).getAttribute("href") ?? ""; return { href, sourceHref: href, blocked: false, title: (element as HTMLAnchorElement).getAttribute("title") ?? "" }; } }], toDOM: (mark) => mark.attrs.blocked ? ["span", { "data-mdfn-blocked-link": "true" }, 0] : ["a", { href: mark.attrs.href, title: mark.attrs.title || null }, 0] },
    strike: { parseDOM: [{ tag: "del" }, { tag: "s" }], toDOM: () => ["del", 0] },
  },
});

function marksFor(node: MdfnNode, active: readonly Mark[]): readonly import("prosemirror-model").Mark[] {
  if (node.type === "strong") return [...active, mdfnSchema.marks.strong.create()];
  if (node.type === "emphasis") return [...active, mdfnSchema.marks.em.create()];
  if (node.type === "delete") return [...active, mdfnSchema.marks.strike.create()];
  if (node.type === "inlineCode") return [...active, mdfnSchema.marks.code.create()];
  if (node.type === "link") {
    const sourceHref = String(node.attrs?.url ?? "");
    const safe = inspectMdfnUrl(sourceHref, { allowedSchemes: ["http", "https", "mailto"], allowRelative: true }).safe;
    return [...active, mdfnSchema.marks.link.create({ href: safe ? sourceHref : "", sourceHref, blocked: !safe, title: String(node.attrs?.title ?? ""), referenceIdentifier: String(node.attrs?.referenceIdentifier ?? ""), referenceLabel: String(node.attrs?.referenceLabel ?? ""), referenceType: String(node.attrs?.referenceType ?? "") })];
  }
  return active;
}

function inlineNodes(nodes: readonly MdfnNode[] | undefined, active: readonly Mark[] = []): PmNode[] {
  return (nodes ?? []).flatMap((node) => {
    const marks = marksFor(node, active);
    if (node.type === "text" || node.type === "inlineCode") return node.text ? [mdfnSchema.text(node.text, marks)] : [];
    if (node.type === "image") {
      const sourceSrc = String(node.attrs?.url ?? "");
      const safe = inspectMdfnUrl(sourceSrc, { allowedSchemes: ["http", "https"], allowRelative: true }).safe;
      return [mdfnSchema.nodes.image.create({ src: safe ? sourceSrc : "", sourceSrc, blocked: !safe, alt: String(node.attrs?.alt ?? ""), title: String(node.attrs?.title ?? ""), referenceIdentifier: String(node.attrs?.referenceIdentifier ?? ""), referenceLabel: String(node.attrs?.referenceLabel ?? ""), referenceType: String(node.attrs?.referenceType ?? "") }, undefined, marks)];
    }
    if (node.type === "asset") return [mdfnSchema.nodes.asset.create({ ...attrsFromSource(node.source), provider: String(node.attrs?.provider ?? ""), assetId: String(node.attrs?.id ?? ""), documentId: String(node.attrs?.documentId ?? ""), versionId: String(node.attrs?.versionId ?? ""), sourceUrl: String(node.attrs?.url ?? ""), alt: String(node.attrs?.alt ?? ""), title: String(node.attrs?.title ?? "") }, undefined, marks)];
    if (node.type === "opaque") return [mdfnSchema.nodes.opaque_inline.create({ ...attrsFromSource(node.source), syntax: String(node.attrs?.syntax ?? "unknown"), raw: node.source?.raw ?? node.text ?? "" }, undefined, marks)];
    if (node.type === "hardBreak") return [mdfnSchema.nodes.hard_break.create(undefined, undefined, marks)];
    return inlineNodes(node.content, marks);
  });
}

function blockNode(node: MdfnNode): PmNode {
  const source = attrsFromSource(node.source);
  switch (node.type) {
    case "paragraph": return mdfnSchema.nodes.paragraph.create(source, inlineNodes(node.content));
    case "heading": return mdfnSchema.nodes.heading.create({ ...source, level: Number(node.attrs?.level ?? 1) }, inlineNodes(node.content));
    case "blockquote": return mdfnSchema.nodes.blockquote.create(source, (node.content ?? []).map(blockNode));
    case "thematicBreak": return mdfnSchema.nodes.horizontal_rule.create(source);
    case "codeBlock": return mdfnSchema.nodes.code_block.create({ ...source, language: String(node.attrs?.language ?? ""), meta: String(node.attrs?.meta ?? "") }, node.text ? mdfnSchema.text(node.text) : undefined);
    case "list": {
      const ordered = node.attrs?.ordered === true;
      const spread = node.attrs?.spread === true;
      return (ordered ? mdfnSchema.nodes.ordered_list : mdfnSchema.nodes.bullet_list).create(ordered ? { ...source, order: Number(node.attrs?.start ?? 1), spread } : { ...source, spread }, (node.content ?? []).map(blockNode));
    }
    case "listItem": {
      const childBlocks = (node.content ?? []).map((child) => child.type === "paragraph" ? blockNode(child) : blockNode(child));
      const content = childBlocks.length > 0 ? childBlocks : [mdfnSchema.nodes.paragraph.create()];
      return mdfnSchema.nodes.list_item.create({ checked: typeof node.attrs?.checked === "boolean" ? node.attrs.checked : null }, content);
    }
    case "table": return mdfnSchema.nodes.table.create({ ...source, mdfnAlign: Array.isArray(node.attrs?.align) ? [...node.attrs.align] : [] }, (node.content ?? []).map(blockNode));
    case "tableRow": return mdfnSchema.nodes.table_row.create(undefined, (node.content ?? []).map(blockNode));
    case "tableCell": return mdfnSchema.nodes.table_cell.create(undefined, (node.content ?? []).map((child) => child.type === "paragraph" ? blockNode(child) : mdfnSchema.nodes.paragraph.create(undefined, inlineNodes([child]))));
    case "opaque": return mdfnSchema.nodes.opaque_block.create({ ...source, syntax: String(node.attrs?.syntax ?? "unknown"), raw: node.source?.raw ?? node.text ?? "" });
    default: return mdfnSchema.nodes.extension_block.create({ ...source, nodeType: node.type, nodeAttrs: JSON.stringify(node.attrs ?? {}), nodeContent: JSON.stringify(node.content ?? []), raw: node.source?.raw ?? "", text: node.text ?? "" });
  }
}

export function documentToProseMirror(document: MdfnDocument): PmNode {
  const content = document.content.map(blockNode);
  return mdfnSchema.nodes.doc.create(undefined, content.length > 0 ? content : [mdfnSchema.nodes.paragraph.create()]);
}

function sourceFromAttrs(node: PmNode, dirty: boolean): SourceSpan | undefined {
  const from = node.attrs.mdfnFrom;
  const to = node.attrs.mdfnTo;
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  const source: SourceSpan = {
    from,
    to,
    preservation: ["exact", "semantic", "opaque"].includes(node.attrs.mdfnPreservation) ? node.attrs.mdfnPreservation : "semantic",
    dirty,
  };
  return !dirty && typeof node.attrs.mdfnRaw === "string" ? { ...source, raw: node.attrs.mdfnRaw } : source;
}

function wrapMarks(node: MdfnNode, marks: readonly Mark[]): MdfnNode {
  return marks.reduceRight<MdfnNode>((content, mark) => {
    if (mark.type === mdfnSchema.marks.strong) return { type: "strong", content: [content] };
    if (mark.type === mdfnSchema.marks.em) return { type: "emphasis", content: [content] };
    if (mark.type === mdfnSchema.marks.code) {
      const text = content.text ?? content.content?.map((child) => child.text ?? "").join("") ?? "";
      return { type: "inlineCode", text };
    }
    if (mark.type === mdfnSchema.marks.strike) return { type: "delete", content: [content] };
    if (mark.type === mdfnSchema.marks.link) return { type: "link", attrs: { url: String(mark.attrs.sourceHref || mark.attrs.href), title: String(mark.attrs.title ?? ""), unsafe: mark.attrs.blocked === true, referenceIdentifier: String(mark.attrs.referenceIdentifier ?? ""), referenceLabel: String(mark.attrs.referenceLabel ?? ""), referenceType: String(mark.attrs.referenceType ?? "") }, content: [content] };
    return content;
  }, node);
}

function inlineFromPm(node: PmNode): MdfnNode[] {
  const output: MdfnNode[] = [];
  node.forEach((child) => {
    if (child.isText) output.push(wrapMarks({ type: "text", text: child.text ?? "" }, child.marks));
    else if (child.type === mdfnSchema.nodes.image) output.push(wrapMarks({ type: "image", attrs: { url: child.attrs.sourceSrc || child.attrs.src, alt: child.attrs.alt, title: child.attrs.title, unsafe: child.attrs.blocked === true, referenceIdentifier: child.attrs.referenceIdentifier, referenceLabel: child.attrs.referenceLabel, referenceType: child.attrs.referenceType } as Record<string, MdfnJsonValue> }, child.marks));
    else if (child.type === mdfnSchema.nodes.asset) output.push(wrapMarks({ type: "asset", source: sourceFromAttrs(child, false), attrs: { provider: child.attrs.provider, id: child.attrs.assetId, documentId: child.attrs.documentId, versionId: child.attrs.versionId, url: child.attrs.sourceUrl, alt: child.attrs.alt, title: child.attrs.title } as Record<string, MdfnJsonValue> }, child.marks));
    else if (child.type === mdfnSchema.nodes.opaque_inline) output.push(wrapMarks({ type: "opaque", source: sourceFromAttrs(child, false), text: String(child.attrs.raw), attrs: { syntax: child.attrs.syntax, inline: true } }, child.marks));
    else if (child.type === mdfnSchema.nodes.hard_break) output.push({ type: "hardBreak" });
  });
  return output;
}

function pmToBlock(node: PmNode, dirty: boolean): MdfnNode {
  const source = sourceFromAttrs(node, dirty);
  if (node.type === mdfnSchema.nodes.paragraph) return { type: "paragraph", source, content: inlineFromPm(node) };
  if (node.type === mdfnSchema.nodes.heading) return { type: "heading", source, attrs: { level: node.attrs.level }, content: inlineFromPm(node) };
  if (node.type === mdfnSchema.nodes.blockquote) return { type: "blockquote", source, content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.horizontal_rule) return { type: "thematicBreak", source };
  if (node.type === mdfnSchema.nodes.code_block) return { type: "codeBlock", source, text: node.textContent, attrs: { language: node.attrs.language, meta: node.attrs.meta } };
  if (node.type === mdfnSchema.nodes.bullet_list || node.type === mdfnSchema.nodes.ordered_list) return { type: "list", source, attrs: { ordered: node.type === mdfnSchema.nodes.ordered_list, start: node.attrs.order ?? 1, spread: node.attrs.spread === true }, content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.list_item) return { type: "listItem", attrs: { checked: node.attrs.checked }, content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.table) return { type: "table", source, attrs: { align: Array.isArray(node.attrs.mdfnAlign) ? node.attrs.mdfnAlign : [] }, content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.table_row) return { type: "tableRow", content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.table_cell || node.type === mdfnSchema.nodes.table_header) return { type: "tableCell", content: node.content.content.map((child) => pmToBlock(child, dirty)) };
  if (node.type === mdfnSchema.nodes.opaque_block) return { type: "opaque", source, text: node.attrs.raw, attrs: { syntax: node.attrs.syntax } };
  if (node.type === mdfnSchema.nodes.extension_block) {
    let attrs: Readonly<Record<string, MdfnJsonValue>> = {};
    let content: readonly MdfnNode[] = [];
    try { attrs = JSON.parse(String(node.attrs.nodeAttrs)); } catch { attrs = {}; }
    try { content = JSON.parse(String(node.attrs.nodeContent)); } catch { content = []; }
    return { type: String(node.attrs.nodeType), source, attrs, content, text: String(node.attrs.text ?? "") || undefined };
  }
  return { type: "paragraph", source, content: inlineFromPm(node) };
}

export function proseMirrorToDocument(current: PmNode, previous?: PmNode, schemaVersion = 1): MdfnDocument {
  const content = current.content.content.map((child, index) => {
    const previousChild = previous && index < previous.childCount ? previous.child(index) : undefined;
    const dirty = !previousChild || !child.eq(previousChild);
    return pmToBlock(child, dirty);
  });
  return { type: "doc", schemaVersion, content };
}
