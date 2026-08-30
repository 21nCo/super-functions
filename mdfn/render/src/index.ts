import {
  resolveExtensions,
  inspectMdfnUrl,
  type ExtensionRenderNode,
  type MdfnDiagnostic,
  type MdfnDocument,
  type MdfnExtension,
  type MdfnJsonValue,
  type MdfnNode,
  type ResolvedExtensionRegistry,
} from "@mdfn/core";

export interface LinkPolicy {
  readonly allowedSchemes?: readonly string[];
  readonly allowRelative?: boolean;
  readonly allowProtocolRelative?: boolean;
  readonly externalTarget?: "_blank" | "_self" | null;
  readonly externalRel?: string;
}

export interface ImagePolicy {
  readonly allowedSchemes?: readonly string[];
  readonly allowRelative?: boolean;
  readonly loading?: "lazy" | "eager";
  readonly decoding?: "async" | "sync" | "auto";
}

export interface RenderPolicy {
  readonly links?: LinkPolicy;
  readonly images?: ImagePolicy;
  readonly rawHtml?: { readonly enabled: boolean; readonly sanitize?: (raw: string) => string };
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxOutputBytes?: number;
  readonly extensions?: readonly MdfnExtension[] | ResolvedExtensionRegistry;
}

export interface RenderResult {
  readonly html: string;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly nodeCount: number;
}

export interface RenderTreeNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, MdfnJsonValue>>;
  readonly text?: string;
  readonly children?: readonly RenderTreeNode[];
}

const DEFAULT_LINKS: Required<LinkPolicy> = {
  allowedSchemes: ["http", "https", "mailto"],
  allowRelative: true,
  allowProtocolRelative: false,
  externalTarget: "_blank",
  externalRel: "noreferrer noopener",
};

const DEFAULT_IMAGES: Required<ImagePolicy> = {
  allowedSchemes: ["http", "https"],
  allowRelative: true,
  loading: "lazy",
  decoding: "async",
};

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function stringAttr(node: MdfnNode, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
}

function numberAttr(node: MdfnNode, name: string, fallback: number): number {
  const value = node.attrs?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanAttr(node: MdfnNode, name: string): boolean {
  return node.attrs?.[name] === true;
}

function validateUrl(url: string, policy: { allowedSchemes: readonly string[]; allowRelative: boolean; allowProtocolRelative: boolean }): boolean {
  return inspectMdfnUrl(url, policy).safe;
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function resolveRegistry(policy: RenderPolicy): ResolvedExtensionRegistry {
  const configured = policy.extensions;
  if (configured && "schemaHash" in configured) return configured;
  return resolveExtensions(configured ?? []);
}

function renderChildren(node: MdfnNode, context: RenderContext, depth: number): string {
  return (node.content ?? []).map((child) => renderNode(child, context, depth + 1)).join("");
}

function renderBlockChildren(node: MdfnNode, context: RenderContext, depth: number): string {
  const rendered = (node.content ?? []).map((child) => renderNode(child, context, depth + 1));
  return rendered.length === 0 ? "" : `${rendered.join("\n")}\n`;
}

interface RenderContext {
  readonly policy: RenderPolicy;
  readonly registry: ResolvedExtensionRegistry;
  readonly diagnostics: MdfnDiagnostic[];
  nodeCount: number;
}

function countRenderedNode(context: RenderContext): void {
  context.nodeCount += 1;
  const maxNodes = context.policy.maxNodes ?? 100_000;
  if (context.nodeCount > maxNodes) throw new RangeError(`MDFN_RENDER_NODE_LIMIT_EXCEEDED:${maxNodes}`);
}

const EXTENSION_TAGS = new Set([
  "a", "aside", "audio", "blockquote", "br", "code", "dd", "details", "div", "dl", "dt", "em", "figcaption", "figure", "img",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "kbd", "li", "mark", "ol", "p", "pre", "s", "section",
  "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul", "video",
]);
const EXTENSION_ATTRS = new Set(["alt", "class", "colspan", "controls", "decoding", "id", "loading", "open", "rel", "role", "rowspan", "target", "title"]);

function renderExtensionNode(node: ExtensionRenderNode, context: RenderContext, depth: number): string {
  countRenderedNode(context);
  if (!node || typeof node !== "object" || !EXTENSION_TAGS.has(node.tag)) throw new Error("MDFN_EXTENSION_RENDER_TAG_FORBIDDEN");
  if (depth > (context.policy.maxDepth ?? 128)) throw new RangeError(`MDFN_RENDER_DEPTH_LIMIT_EXCEEDED:${context.policy.maxDepth ?? 128}`);
  const attributes: string[] = [];
  let linkHref: string | undefined;
  for (const [name, rawValue] of Object.entries(node.attrs ?? {})) {
    const normalizedName = name.toLowerCase();
    if (!/^[a-z][a-z0-9_.:-]*$/.test(normalizedName)) throw new Error("MDFN_EXTENSION_RENDER_ATTRIBUTE_FORBIDDEN");
    if (/^on/.test(normalizedName) || normalizedName === "style" || normalizedName === "srcdoc") throw new Error("MDFN_EXTENSION_RENDER_ATTRIBUTE_FORBIDDEN");
    const allowed = EXTENSION_ATTRS.has(normalizedName) || normalizedName.startsWith("aria-") || normalizedName.startsWith("data-") || normalizedName === "href" || normalizedName === "src";
    if (!allowed) throw new Error(`MDFN_EXTENSION_RENDER_ATTRIBUTE_FORBIDDEN:${normalizedName}`);
    if (rawValue === false || rawValue === null || rawValue === undefined) continue;
    if (node.tag === "a" && (normalizedName === "target" || normalizedName === "rel")) continue;
    if (normalizedName === "href") {
      const value = String(rawValue);
      const policy = { ...DEFAULT_LINKS, ...(context.policy.links ?? {}) };
      if (!validateUrl(value, policy)) throw new Error("MDFN_EXTENSION_RENDER_URL_FORBIDDEN");
      if (node.tag === "a") linkHref = value;
    }
    if (normalizedName === "src") {
      const value = String(rawValue);
      const policy = { ...DEFAULT_IMAGES, ...(context.policy.images ?? {}) };
      if (!validateUrl(value, { ...policy, allowProtocolRelative: false })) throw new Error("MDFN_EXTENSION_RENDER_URL_FORBIDDEN");
    }
    attributes.push(rawValue === true ? ` ${normalizedName}` : ` ${normalizedName}="${escapeHtml(String(rawValue))}"`);
  }
  if (node.tag === "a" && linkHref && isExternal(linkHref)) {
    const policy = { ...DEFAULT_LINKS, ...(context.policy.links ?? {}) };
    if (policy.externalTarget) attributes.push(` target="${policy.externalTarget}"`);
    if (policy.externalRel) attributes.push(` rel="${escapeHtml(policy.externalRel)}"`);
  }
  const contents = `${node.text === undefined ? "" : escapeHtml(node.text)}${(node.children ?? []).map((child) => renderExtensionNode(child, context, depth + 1)).join("")}`;
  if (["br", "hr", "img"].includes(node.tag)) return `<${node.tag}${attributes.join("")}>`;
  return `<${node.tag}${attributes.join("")}>${contents}</${node.tag}>`;
}

function pushUnsafeUrl(context: RenderContext, node: MdfnNode, kind: "link" | "image", url: string): void {
  context.diagnostics.push({
    code: "MDFN_UNSAFE_URL_BLOCKED",
    message: `Unsafe ${kind} URL was blocked`,
    severity: "warning",
    nodeId: node.id,
    source: node.source ? { from: node.source.from, to: node.source.to } : undefined,
    details: { kind, scheme: /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase() ?? "relative" },
  });
}

function renderNode(node: MdfnNode, context: RenderContext, depth: number): string {
  countRenderedNode(context);
  const maxDepth = context.policy.maxDepth ?? 128;
  if (depth > maxDepth) throw new RangeError(`MDFN_RENDER_DEPTH_LIMIT_EXCEEDED:${maxDepth}`);

  for (const extension of context.registry.extensions) {
    const rendered = extension.render?.({ node, escape: escapeHtml });
    if (rendered !== null && rendered !== undefined) {
      if (typeof rendered !== "object") throw new Error("MDFN_EXTENSION_RENDER_RESULT_INVALID");
      const sanitized = extension.sanitizeRender ? extension.sanitizeRender(rendered) : rendered;
      if (!sanitized) throw new Error("MDFN_EXTENSION_RENDER_REJECTED");
      return renderExtensionNode(sanitized, context, depth + 1);
    }
  }

  const children = () => renderChildren(node, context, depth);
  switch (node.type) {
    case "text": return escapeHtml(node.text ?? "");
    case "paragraph": return `<p>${children()}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, numberAttr(node, "level", 1)));
      return `<h${level}>${children()}</h${level}>`;
    }
    case "blockquote": return `<blockquote>\n${renderBlockChildren(node, context, depth)}</blockquote>`;
    case "list": {
      const ordered = booleanAttr(node, "ordered");
      const start = numberAttr(node, "start", 1);
      const tight = node.attrs?.spread !== true && (node.content ?? []).every((item) => item.attrs?.spread !== true);
      const task = (node.content ?? []).some((item) => typeof item.attrs?.checked === "boolean");
      const items = (node.content ?? []).map((item) => {
        countRenderedNode(context);
        const checked = item.attrs?.checked;
        const checkbox = typeof checked === "boolean" ? `<input type="checkbox" disabled${checked ? " checked" : ""}> ` : "";
        const body = (item.content ?? []).map((child) => {
          if (child.type !== "paragraph" || !tight) return renderNode(child, context, depth + 2);
          countRenderedNode(context);
          return renderChildren(child, context, depth + 2);
        }).join("");
        return `<li${typeof checked === "boolean" ? ' class="task-list-item"' : ""}>${checkbox}${body}</li>`;
      }).join("");
      return ordered
        ? `<ol${start === 1 ? "" : ` start=\"${start}\"`}>${items}</ol>`
        : `<ul${task ? ' class="contains-task-list"' : ""}>${items}</ul>`;
    }
    case "listItem": {
      const checked = node.attrs?.checked;
      const checkbox = typeof checked === "boolean" ? `<input type="checkbox" disabled${checked ? " checked" : ""} aria-hidden="true">` : "";
      return `<li>${checkbox}${children()}</li>`;
    }
    case "codeBlock": {
      const language = stringAttr(node, "language");
      const code = node.text ?? "";
      return `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(code)}${code ? "\n" : ""}</code></pre>`;
    }
    case "inlineCode": return `<code>${escapeHtml(node.text ?? "")}</code>`;
    case "thematicBreak": return "<hr>";
    case "hardBreak": return "<br>";
    case "strong": return `<strong>${children()}</strong>`;
    case "emphasis": return `<em>${children()}</em>`;
    case "delete": return `<del>${children()}</del>`;
    case "link": {
      const url = stringAttr(node, "url");
      const policy = { ...DEFAULT_LINKS, ...(context.policy.links ?? {}) };
      if (!validateUrl(url, policy)) {
        pushUnsafeUrl(context, node, "link", url);
        return `<span data-mdfn-blocked-link="true">${children()}</span>`;
      }
      const title = stringAttr(node, "title");
      const external = isExternal(url);
      const target = external && policy.externalTarget ? ` target="${policy.externalTarget}"` : "";
      const rel = external && policy.externalRel ? ` rel="${escapeHtml(policy.externalRel)}"` : "";
      return `<a href="${escapeHtml(encodeURI(url))}"${title ? ` title="${escapeHtml(title)}"` : ""}${target}${rel}>${children()}</a>`;
    }
    case "image": {
      const url = stringAttr(node, "url");
      const policy = { ...DEFAULT_IMAGES, ...(context.policy.images ?? {}) };
      if (!validateUrl(url, { ...policy, allowProtocolRelative: false })) {
        pushUnsafeUrl(context, node, "image", url);
        return `<span data-mdfn-blocked-image="true">${escapeHtml(stringAttr(node, "alt"))}</span>`;
      }
      return `<img src="${escapeHtml(encodeURI(url))}" alt="${escapeHtml(stringAttr(node, "alt"))}"${stringAttr(node, "title") ? ` title="${escapeHtml(stringAttr(node, "title"))}"` : ""} loading="${policy.loading}" decoding="${policy.decoding}">`;
    }
    case "asset": return `<span data-mdfn-asset="${escapeHtml(stringAttr(node, "id"))}" data-mdfn-provider="${escapeHtml(stringAttr(node, "provider"))}">${escapeHtml(stringAttr(node, "alt") || "Asset")}</span>`;
    case "definition": return "";
    case "table": {
      const rows = node.content ?? [];
      const align = Array.isArray(node.attrs?.align) ? node.attrs.align : [];
      const renderRow = (row: MdfnNode, header: boolean): string => {
        countRenderedNode(context);
        return `<tr>${(row.content ?? []).map((cell, index) => {
        countRenderedNode(context);
        const tag = header ? "th" : "td";
        const alignment = typeof align[index] === "string" && align[index] ? ` align="${escapeHtml(String(align[index]))}"` : "";
        return `<${tag}${alignment}>${renderChildren(cell, context, depth + 2)}</${tag}>`;
        }).join("")}</tr>`;
      };
      const head = rows[0] ? `<thead>${renderRow(rows[0], true)}</thead>` : "";
      const body = rows.length > 1 ? `<tbody>${rows.slice(1).map((row) => renderRow(row, false)).join("")}</tbody>` : "";
      return `<table>${head}${body}</table>`;
    }
    case "tableRow": return `<tr>${children()}</tr>`;
    case "tableCell": return `<td>${children()}</td>`;
    case "opaque": {
      const syntax = stringAttr(node, "syntax") || "unknown";
      const raw = node.source?.raw ?? node.text ?? "";
      if (syntax === "html" && context.policy.rawHtml?.enabled) {
        if (!context.policy.rawHtml.sanitize) throw new Error("MDFN_RAW_HTML_SANITIZER_REQUIRED");
        return context.policy.rawHtml.sanitize(node.text ?? raw);
      }
      return node.attrs?.inline === true
        ? `<code data-mdfn-opaque-inline="${escapeHtml(syntax)}">${escapeHtml(raw)}</code>`
        : `<pre data-mdfn-opaque="${escapeHtml(syntax)}"><code>${escapeHtml(raw)}</code></pre>`;
    }
    default:
      context.diagnostics.push({ code: "MDFN_RENDER_NODE_UNSUPPORTED", message: `Node ${node.type} has no renderer`, severity: "warning", nodeId: node.id });
      return `<span data-mdfn-unsupported="${escapeHtml(node.type)}">${children()}</span>`;
  }
}

export function renderHtml(document: MdfnDocument, policy: RenderPolicy = {}): RenderResult {
  const context: RenderContext = { policy, registry: resolveRegistry(policy), diagnostics: [], nodeCount: 0 };
  const blocks = document.content.map((node) => renderNode(node, context, 1));
  const html = blocks.length === 0 ? "" : `${blocks.join("\n")}\n`;
  const maxOutputBytes = policy.maxOutputBytes ?? 8 * 1024 * 1024;
  if (new TextEncoder().encode(html).byteLength > maxOutputBytes) throw new RangeError(`MDFN_RENDER_OUTPUT_TOO_LARGE:${maxOutputBytes}`);
  return { html, diagnostics: context.diagnostics, nodeCount: context.nodeCount };
}

export function renderTree(document: MdfnDocument): RenderTreeNode {
  const convert = (node: MdfnNode): RenderTreeNode => ({
    type: node.type,
    attrs: node.attrs,
    text: node.text,
    children: node.content?.map(convert),
  });
  return { type: "doc", children: document.content.map(convert) };
}

function plainText(node: MdfnNode): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "codeBlock") return node.text ?? "";
  if (node.type === "image") return stringAttr(node, "alt");
  if (node.type === "opaque") return "";
  const separator = ["paragraph", "heading", "blockquote", "listItem", "tableRow"].includes(node.type) ? "\n" : "";
  return (node.content ?? []).map(plainText).join("") + separator;
}

export function extractPlainText(document: MdfnDocument): string {
  return document.content.map(plainText).join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractHeadings(document: MdfnDocument): Array<{ level: number; text: string; nodeId?: string }> {
  const headings: Array<{ level: number; text: string; nodeId?: string }> = [];
  const visit = (node: MdfnNode): void => {
    if (node.type === "heading") headings.push({ level: numberAttr(node, "level", 1), text: plainText(node).trim(), nodeId: node.id });
    node.content?.forEach(visit);
  };
  visit(document);
  return headings;
}

export function extractLinks(document: MdfnDocument): Array<{ url: string; text: string; nodeId?: string }> {
  const links: Array<{ url: string; text: string; nodeId?: string }> = [];
  const visit = (node: MdfnNode): void => {
    if (node.type === "link") links.push({ url: stringAttr(node, "url"), text: plainText(node), nodeId: node.id });
    node.content?.forEach(visit);
  };
  visit(document);
  return links;
}

function splitBoundedText(value: string, maximum: number): readonly string[] {
  const limit = Math.max(1, Math.floor(maximum));
  const pieces: string[] = [];
  let remaining = value.trim();
  while (remaining.length > limit) {
    let end = limit;
    const previous = remaining.charCodeAt(end - 1);
    const next = remaining.charCodeAt(end);
    if (end > 1 && previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;
    const piece = remaining.slice(0, end).trim();
    if (piece) pieces.push(piece);
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

export function extractChunks(document: MdfnDocument, maxCharacters = 2_000): Array<{ text: string; heading?: string }> {
  const limit = Math.max(1, Math.floor(maxCharacters));
  const chunks: Array<{ text: string; heading?: string }> = [];
  let heading: string | undefined;
  let buffer = "";
  const flush = (): void => {
    const text = buffer.trim();
    if (text) chunks.push({ text, heading });
    buffer = "";
  };
  for (const node of document.content) {
    if (node.type === "heading") {
      flush();
      heading = plainText(node).trim();
      continue;
    }
    const value = plainText(node).trim();
    if (!value) continue;
    for (const piece of splitBoundedText(value, limit)) {
      if (buffer && buffer.length + piece.length + 2 > limit) flush();
      buffer += `${buffer ? "\n\n" : ""}${piece}`;
      if (buffer.length >= limit) flush();
    }
  }
  flush();
  return chunks;
}

export interface ExtractedDocument {
  readonly plainText: string;
  readonly headings: readonly { readonly level: number; readonly text: string; readonly nodeId?: string }[];
  readonly links: readonly { readonly url: string; readonly text: string; readonly nodeId?: string }[];
  readonly chunks: readonly {
    readonly text: string;
    readonly headingPath: readonly string[];
    readonly links: readonly { readonly url: string; readonly text: string; readonly nodeId?: string }[];
  }[];
}

export function extractDocument(document: MdfnDocument, options: { readonly maxChunkLength?: number } = {}): ExtractedDocument {
  const maxChunkLength = Math.max(64, options.maxChunkLength ?? 2_000);
  const headings = extractHeadings(document);
  const links = extractLinks(document);
  const headingPath: string[] = [];
  const chunks: Array<ExtractedDocument["chunks"][number]> = [];
  let text = "";
  let chunkLinks: ExtractedDocument["chunks"][number]["links"] = [];
  const flush = (): void => {
    const value = text.trim();
    if (value) chunks.push({ text: value, headingPath: Object.freeze([...headingPath]), links: Object.freeze([...chunkLinks]) });
    text = "";
    chunkLinks = [];
  };
  for (const node of document.content) {
    if (node.type === "heading") {
      flush();
      const level = numberAttr(node, "level", 1);
      headingPath.length = Math.min(headingPath.length, Math.max(0, level - 1));
      headingPath.push(plainText(node).trim());
      continue;
    }
    const value = plainText(node).trim();
    if (!value) continue;
    let nodeLinks: ExtractedDocument["chunks"][number]["links"] = [];
    const visitLinks = (candidate: MdfnNode): void => {
      if (candidate.type === "link") nodeLinks = [...nodeLinks, { url: stringAttr(candidate, "url"), text: plainText(candidate), nodeId: candidate.id }];
      candidate.content?.forEach(visitLinks);
    };
    visitLinks(node);
    for (const piece of splitBoundedText(value, maxChunkLength)) {
      if (text && text.length + piece.length + 2 > maxChunkLength) flush();
      text += `${text ? "\n\n" : ""}${piece}`;
      chunkLinks = [...chunkLinks, ...nodeLinks];
      if (text.length >= maxChunkLength) flush();
    }
  }
  flush();
  return { plainText: extractPlainText(document), headings, links, chunks };
}

export const MDFN_RENDER_VERSION = "0.1.0" as const;
