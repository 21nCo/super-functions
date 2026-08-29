import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";
import {
  hashString,
  inspectMdfnUrl,
  parseMdfnAssetUrl,
  resolveExtensions,
  type EditorProjector,
  type MdfnDiagnostic,
  type MdfnDocument,
  type MdfnExtension,
  type MdfnJsonValue,
  type MdfnNode,
  type ResolvedExtensionRegistry,
  type SerializeResult,
  type SourceSpan,
} from "@mdfn/core";

type MdastPosition = { start?: { offset?: number }; end?: { offset?: number } };
type MdastNode = {
  type: string;
  value?: string;
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  ordered?: boolean;
  start?: number | null;
  spread?: boolean;
  checked?: boolean | null;
  url?: string;
  title?: string | null;
  alt?: string;
  align?: Array<"left" | "right" | "center" | null>;
  identifier?: string;
  label?: string | null;
  referenceType?: "shortcut" | "collapsed" | "full";
  children?: MdastNode[];
  position?: MdastPosition;
  [key: string]: unknown;
};

export type MarkdownDialect = "commonmark" | "gfm";

export interface MarkdownLimits {
  readonly maxBytes?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxTokenLength?: number;
}

export interface MarkdownOptions extends MarkdownLimits {
  readonly dialect?: MarkdownDialect;
  readonly allowRawHtml?: boolean;
  readonly schemaVersion?: number;
  readonly extensions?: readonly MdfnExtension[] | ResolvedExtensionRegistry;
}

export interface MarkdownParseResult {
  readonly source: string;
  readonly document: MdfnDocument;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly sourceHash: string;
  readonly dialect: MarkdownDialect;
  readonly lineEnding: "lf" | "crlf" | "cr";
  readonly encoding: "utf-8";
  readonly nodeCount: number;
}

export interface MarkdownSerializeInput {
  readonly document: MdfnDocument;
  readonly originalSource: string;
  readonly options?: MarkdownOptions;
}

const DEFAULT_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxNodes: 100_000,
  maxDepth: 128,
  maxTokenLength: 256 * 1024,
} as const;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function diagnostic(
  code: string,
  message: string,
  severity: MdfnDiagnostic["severity"],
  source?: { from: number; to: number },
  details?: Readonly<Record<string, MdfnJsonValue>>,
): MdfnDiagnostic {
  return { code, message, severity, source, details };
}

function detectLineEnding(source: string): MarkdownParseResult["lineEnding"] {
  if (source.includes("\r\n")) return "crlf";
  if (source.includes("\r")) return "cr";
  return "lf";
}

function sourceSpan(node: MdastNode, source: string, preservation: SourceSpan["preservation"] = "exact"): SourceSpan | undefined {
  const from = node.position?.start?.offset;
  const to = node.position?.end?.offset;
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  return { from, to, raw: source.slice(from, to), preservation };
}

function attrs(input: Record<string, unknown>): Readonly<Record<string, MdfnJsonValue>> | undefined {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null);
  return entries.length === 0 ? undefined : Object.fromEntries(entries) as Readonly<Record<string, MdfnJsonValue>>;
}

function convertMdastNode(
  node: MdastNode,
  source: string,
  diagnostics: MdfnDiagnostic[],
  depth: number,
  allowRawHtml: boolean,
  definitions: ReadonlyMap<string, MdastNode>,
  inlineContext = false,
): MdfnNode {
  const span = sourceSpan(node, source);
  const id = span ? `${node.type}:${span.from}:${span.to}` : undefined;
  const childInline = ["paragraph", "heading", "strong", "emphasis", "delete", "link", "linkReference"].includes(node.type);
  const content = node.children?.map((child) => convertMdastNode(child, source, diagnostics, depth + 1, allowRawHtml, definitions, childInline));
  const common = { id, source: span, content };
  switch (node.type) {
    case "text": return { type: "text", id, source: span, text: node.value ?? "" };
    case "paragraph": return { type: "paragraph", ...common };
    case "heading": return { type: "heading", ...common, attrs: attrs({ level: node.depth ?? 1 }) };
    case "blockquote": return { type: "blockquote", ...common };
    case "list": return { type: "list", ...common, attrs: attrs({ ordered: node.ordered ?? false, start: node.start ?? 1, spread: node.spread ?? false }) };
    case "listItem": return { type: "listItem", ...common, attrs: attrs({ checked: node.checked ?? null, spread: node.spread ?? false }) };
    case "code": return { type: "codeBlock", id, source: span, text: node.value ?? "", attrs: attrs({ language: node.lang ?? "", meta: node.meta ?? "" }) };
    case "inlineCode": return { type: "inlineCode", id, source: span, text: (node.value ?? "").replace(/\r\n|\r|\n/g, " ") };
    case "thematicBreak": return { type: "thematicBreak", id, source: span };
    case "break": return { type: "hardBreak", id, source: span };
    case "strong": return { type: "strong", ...common };
    case "emphasis": return { type: "emphasis", ...common };
    case "delete": return { type: "delete", ...common };
    case "link": {
      const url = node.url ?? "";
      const inspected = inspectMdfnUrl(url, { allowedSchemes: ["http", "https", "mailto"], allowRelative: true });
      if (!inspected.safe) diagnostics.push(diagnostic("MDFN_UNSAFE_URL", "Unsafe link URL was retained as inert source", "warning", span ? { from: span.from, to: span.to } : undefined, { kind: "link", reason: inspected.reason ?? "scheme" }));
      return { type: "link", ...common, attrs: attrs({ url, title: node.title ?? "", unsafe: !inspected.safe }) };
    }
    case "linkReference": {
      const identifier = (node.identifier ?? "").toLocaleLowerCase();
      const definition = definitions.get(identifier);
      if (!definition) return { type: "opaque", id, source: span ? { ...span, preservation: "opaque" } : undefined, attrs: { syntax: "linkReference", inline: true }, text: span?.raw ?? "" };
      const url = definition.url ?? "";
      const inspected = inspectMdfnUrl(url, { allowedSchemes: ["http", "https", "mailto"], allowRelative: true });
      if (!inspected.safe) diagnostics.push(diagnostic("MDFN_UNSAFE_URL", "Unsafe reference link URL was retained as inert source", "warning", span ? { from: span.from, to: span.to } : undefined, { kind: "link", reason: inspected.reason ?? "scheme" }));
      return { type: "link", ...common, attrs: attrs({ url, title: definition.title ?? "", unsafe: !inspected.safe, referenceIdentifier: node.identifier ?? "", referenceLabel: node.label ?? "", referenceType: node.referenceType ?? "full" }) };
    }
    case "image": {
      const url = node.url ?? "";
      const asset = parseMdfnAssetUrl(url);
      if (asset) return { type: "asset", id, source: span, attrs: attrs({ ...asset, url, alt: node.alt ?? "", title: node.title ?? "" }) };
      const inspected = inspectMdfnUrl(url, { allowedSchemes: ["http", "https"], allowRelative: true });
      if (!inspected.safe) diagnostics.push(diagnostic("MDFN_UNSAFE_URL", "Unsafe image URL was retained as inert source", "warning", span ? { from: span.from, to: span.to } : undefined, { kind: "image", reason: inspected.reason ?? "scheme" }));
      return { type: "image", id, source: span, attrs: attrs({ url, title: node.title ?? "", alt: node.alt ?? "", unsafe: !inspected.safe }) };
    }
    case "imageReference": {
      const identifier = (node.identifier ?? "").toLocaleLowerCase();
      const definition = definitions.get(identifier);
      if (!definition) return { type: "opaque", id, source: span ? { ...span, preservation: "opaque" } : undefined, attrs: { syntax: "imageReference", inline: true }, text: span?.raw ?? "" };
      const url = definition.url ?? "";
      const asset = parseMdfnAssetUrl(url);
      if (asset) return { type: "asset", id, source: span, attrs: attrs({ ...asset, url, alt: node.alt ?? "", title: definition.title ?? "", referenceIdentifier: node.identifier ?? "", referenceLabel: node.label ?? "", referenceType: node.referenceType ?? "full" }) };
      const inspected = inspectMdfnUrl(url, { allowedSchemes: ["http", "https"], allowRelative: true });
      if (!inspected.safe) diagnostics.push(diagnostic("MDFN_UNSAFE_URL", "Unsafe reference image URL was retained as inert source", "warning", span ? { from: span.from, to: span.to } : undefined, { kind: "image", reason: inspected.reason ?? "scheme" }));
      return { type: "image", id, source: span, attrs: attrs({ url, title: definition.title ?? "", alt: node.alt ?? "", unsafe: !inspected.safe, referenceIdentifier: node.identifier ?? "", referenceLabel: node.label ?? "", referenceType: node.referenceType ?? "full" }) };
    }
    case "definition": return { type: "definition", id, source: span, attrs: attrs({ identifier: node.identifier ?? "", label: node.label ?? "", url: node.url ?? "", title: node.title ?? "" }) };
    case "table": return { type: "table", ...common, attrs: attrs({ align: (node.align ?? []).map((value) => value ?? "") }) };
    case "tableRow": return { type: "tableRow", ...common };
    case "tableCell": return { type: "tableCell", ...common };
    case "html": {
      const range = span ? { from: span.from, to: span.to } : undefined;
      if (!allowRawHtml) diagnostics.push(diagnostic("MDFN_RAW_HTML_DISABLED", "Raw HTML was preserved but is disabled by the active policy", "warning", range));
      return { type: "opaque", id, source: span ? { ...span, preservation: "opaque" } : undefined, attrs: { syntax: "html", inline: inlineContext }, text: node.value ?? "" };
    }
    default: {
      const raw = span?.raw ?? node.value ?? "";
      const range = span ? { from: span.from, to: span.to } : undefined;
      diagnostics.push(diagnostic("MDFN_SYNTAX_OPAQUE", `Unsupported syntax ${node.type} was preserved as opaque content`, "warning", range, { syntax: node.type }));
      return { type: "opaque", id, source: span ? { ...span, preservation: "opaque" } : undefined, attrs: { syntax: node.type, inline: inlineContext }, text: raw };
    }
  }
}

function resolveRegistry(options: MarkdownOptions): ResolvedExtensionRegistry {
  const configured = options.extensions;
  if (configured && "schemaHash" in configured) return configured;
  return resolveExtensions(configured ?? []);
}

function scanExtensionBlocks(source: string, registry: ResolvedExtensionRegistry, recognizeFrontmatter: boolean): {
  masked: string;
  nodes: MdfnNode[];
  diagnostics: MdfnDiagnostic[];
} {
  // Source offsets in mdast and the editor protocol are UTF-16 code-unit offsets.
  const characters = source.split("");
  const nodes: MdfnNode[] = [];
  const diagnostics: MdfnDiagnostic[] = [];
  let offset = 0;
  const fallbackAt = (line: string): { consumed: number; syntax: string; diagnostic: string } | null => {
    const directive = /^:::[ \t]*([a-z][a-z0-9-]*)(?:[ \t]+[^\r\n]*)?[ \t]*(?:\r?\n|\r|$)/i.exec(line);
    if (directive) {
      const close = /^:{3,}[ \t]*(?:\r?\n|\r|$)/gm;
      close.lastIndex = offset + line.length;
      const match = close.exec(source);
      return {
        consumed: match ? match.index + match[0].length - offset : source.length - offset,
        syntax: `directive/${directive[1].toLowerCase()}`,
        diagnostic: match ? "MDFN_EXTENSION_DISABLED_OR_UNKNOWN" : "MDFN_DIRECTIVE_UNCLOSED",
      };
    }
    if (recognizeFrontmatter && offset === 0) {
      const fence = /^(---|\+\+\+)[ \t]*(?:\r?\n|\r|$)/.exec(line);
      if (fence) {
        const delimiter = fence[1] === "+++" ? "\\+\\+\\+" : "---";
        const close = new RegExp(`^${delimiter}[ \\t]*(?:\\r?\\n|\\r|$)`, "gm");
        close.lastIndex = line.length;
        const match = close.exec(source);
        if (match) return { consumed: match.index + match[0].length, syntax: "frontmatter", diagnostic: "MDFN_EXTENSION_DISABLED_OR_UNKNOWN" };
      }
    }
    return null;
  };
  let codeFence: { readonly marker: "`" | "~"; readonly length: number } | null = null;
  while (offset < source.length) {
    const lineBreak = /\r\n|\r|\n/g;
    lineBreak.lastIndex = offset;
    const nextBreak = lineBreak.exec(source);
    const end = nextBreak ? nextBreak.index + nextBreak[0].length : source.length;
    const line = source.slice(offset, end);
    const lineContent = line.replace(/(?:\r\n|\r|\n)$/, "");
    if (codeFence) {
      const closing = new RegExp(`^[ \\t]{0,3}${codeFence.marker === "`" ? "`" : "~"}{${codeFence.length},}[ \\t]*$`);
      if (closing.test(lineContent)) codeFence = null;
      offset = end;
      continue;
    }
    const opening = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(lineContent);
    if (opening) {
      codeFence = { marker: opening[1][0] as "`" | "~", length: opening[1].length };
      offset = end;
      continue;
    }
    if (/^(?: {4}|\t)/.test(lineContent)) {
      offset = end;
      continue;
    }
    let matched = false;
    for (const extension of registry.extensions) {
      const result = extension.parseMarkdown?.({ source, offset, line });
      if (!result || result.consumed <= 0) continue;
      const consumedEnd = Math.min(source.length, offset + result.consumed);
      const span: SourceSpan = {
        from: offset,
        to: consumedEnd,
        raw: source.slice(offset, consumedEnd),
        preservation: result.node.source?.preservation ?? "opaque",
      };
      nodes.push({ ...result.node, id: result.node.id ?? `${extension.name}:${offset}:${consumedEnd}`, source: span });
      diagnostics.push(...(result.diagnostics ?? []));
      for (let index = offset; index < consumedEnd; index += 1) {
        if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
      }
      offset = consumedEnd;
      matched = true;
      break;
    }
    if (!matched) {
      const unknown = fallbackAt(line);
      if (unknown) {
        const consumedEnd = Math.min(source.length, offset + unknown.consumed);
        const span: SourceSpan = { from: offset, to: consumedEnd, raw: source.slice(offset, consumedEnd), preservation: "opaque" };
        nodes.push({ type: "opaque", id: `${unknown.syntax}:${offset}:${consumedEnd}`, attrs: { syntax: unknown.syntax }, text: span.raw, source: span });
        diagnostics.push(diagnostic(unknown.diagnostic, `Syntax ${unknown.syntax} is not available in the active profile and was preserved as opaque source`, "warning", { from: offset, to: consumedEnd }, { syntax: unknown.syntax }));
        for (let index = offset; index < consumedEnd; index += 1) {
          if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
        }
        offset = consumedEnd;
        matched = true;
      }
    }
    if (!matched) offset = end;
  }
  return { masked: characters.join(""), nodes, diagnostics };
}

function validateLimits(source: string, options: MarkdownOptions): void {
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS.maxBytes;
  if (byteLength(source) > maxBytes) throw new RangeError(`MDFN_SOURCE_TOO_LARGE:${maxBytes}`);
  const maxTokenLength = options.maxTokenLength ?? DEFAULT_LIMITS.maxTokenLength;
  for (const line of source.split(/\r\n|\r|\n/)) {
    if (line.length > maxTokenLength) throw new RangeError(`MDFN_TOKEN_TOO_LARGE:${maxTokenLength}`);
  }
}

function countAndDepth(node: MdfnNode, depth = 1): { count: number; depth: number } {
  let count = 1;
  let maximum = depth;
  for (const child of node.content ?? []) {
    const nested = countAndDepth(child, depth + 1);
    count += nested.count;
    maximum = Math.max(maximum, nested.depth);
  }
  return { count, depth: maximum };
}

export function parseMarkdown(source: string, options: MarkdownOptions = {}): MarkdownParseResult {
  validateLimits(source, options);
  const dialect = options.dialect ?? "gfm";
  const registry = resolveRegistry(options);
  const extensionScan = scanExtensionBlocks(source, registry, dialect !== "commonmark");
  const mdast = fromMarkdown(extensionScan.masked, dialect === "gfm" ? {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  } : undefined) as MdastNode;
  const diagnostics = [...extensionScan.diagnostics];
  const definitions = new Map<string, MdastNode>();
  const collectDefinitions = (node: MdastNode): void => {
    if (node.type === "definition" && node.identifier && !definitions.has(node.identifier.toLocaleLowerCase())) definitions.set(node.identifier.toLocaleLowerCase(), node);
    node.children?.forEach(collectDefinitions);
  };
  collectDefinitions(mdast);
  const normalNodes = (mdast.children ?? [])
    .filter((node) => {
      const span = sourceSpan(node, source);
      return !span || (span.raw ?? source.slice(span.from, span.to)).trim().length > 0;
    })
    .map((node) => convertMdastNode(node, source, diagnostics, 1, options.allowRawHtml === true, definitions));
  const content = [...normalNodes, ...extensionScan.nodes].sort((a, b) => (a.source?.from ?? Number.MAX_SAFE_INTEGER) - (b.source?.from ?? Number.MAX_SAFE_INTEGER));
  const document: MdfnDocument = {
    type: "doc",
    schemaVersion: options.schemaVersion ?? 1,
    content,
    source: { from: 0, to: source.length, raw: source, preservation: "exact" },
  };
  diagnostics.push(...registry.diagnose(document));
  const shape = countAndDepth(document);
  if (shape.count > (options.maxNodes ?? DEFAULT_LIMITS.maxNodes)) throw new RangeError(`MDFN_NODE_LIMIT_EXCEEDED:${options.maxNodes ?? DEFAULT_LIMITS.maxNodes}`);
  if (shape.depth > (options.maxDepth ?? DEFAULT_LIMITS.maxDepth)) throw new RangeError(`MDFN_DEPTH_LIMIT_EXCEEDED:${options.maxDepth ?? DEFAULT_LIMITS.maxDepth}`);
  return {
    source,
    document,
    diagnostics,
    sourceHash: hashString(source),
    dialect,
    lineEnding: detectLineEnding(source),
    encoding: "utf-8",
    nodeCount: shape.count,
  };
}

function jsonAttr(node: MdfnNode, name: string): MdfnJsonValue | undefined {
  return node.attrs?.[name];
}

function convertNodeToMdast(node: MdfnNode, registry: ResolvedExtensionRegistry): MdastNode {
  for (const extension of registry.extensions) {
    const serialized = extension.serializeMarkdown?.({ node });
    if (serialized !== null && serialized !== undefined) return { type: "mdfnRaw", value: serialized };
  }
  const children = node.content?.map((child) => convertNodeToMdast(child, registry));
  switch (node.type) {
    case "text": return { type: "text", value: node.text ?? "" };
    case "paragraph": return { type: "paragraph", children };
    case "heading": return { type: "heading", depth: Number(jsonAttr(node, "level") ?? 1), children };
    case "blockquote": return { type: "blockquote", children };
    case "list": return { type: "list", ordered: Boolean(jsonAttr(node, "ordered")), start: Number(jsonAttr(node, "start") ?? 1), spread: Boolean(jsonAttr(node, "spread")), children };
    case "listItem": return { type: "listItem", checked: jsonAttr(node, "checked") as boolean | null | undefined, spread: Boolean(jsonAttr(node, "spread")), children };
    case "codeBlock": return { type: "code", value: node.text ?? "", lang: String(jsonAttr(node, "language") ?? "") || null, meta: String(jsonAttr(node, "meta") ?? "") || null };
    case "inlineCode": return { type: "inlineCode", value: node.text ?? "" };
    case "thematicBreak": return { type: "thematicBreak" };
    case "hardBreak": return { type: "break" };
    case "strong": return { type: "strong", children };
    case "emphasis": return { type: "emphasis", children };
    case "delete": return { type: "delete", children };
    case "link": return jsonAttr(node, "referenceIdentifier")
      ? { type: "linkReference", identifier: String(jsonAttr(node, "referenceIdentifier")), label: String(jsonAttr(node, "referenceLabel") ?? "") || null, referenceType: String(jsonAttr(node, "referenceType") ?? "full") as MdastNode["referenceType"], children }
      : { type: "link", url: String(jsonAttr(node, "url") ?? ""), title: String(jsonAttr(node, "title") ?? "") || null, children };
    case "image": return jsonAttr(node, "referenceIdentifier")
      ? { type: "imageReference", identifier: String(jsonAttr(node, "referenceIdentifier")), label: String(jsonAttr(node, "referenceLabel") ?? "") || null, referenceType: String(jsonAttr(node, "referenceType") ?? "full") as MdastNode["referenceType"], alt: String(jsonAttr(node, "alt") ?? "") }
      : { type: "image", url: String(jsonAttr(node, "url") ?? ""), title: String(jsonAttr(node, "title") ?? "") || null, alt: String(jsonAttr(node, "alt") ?? "") };
    case "asset": return { type: "image", url: String(jsonAttr(node, "url") ?? ""), title: String(jsonAttr(node, "title") ?? "") || null, alt: String(jsonAttr(node, "alt") ?? "") };
    case "definition": return { type: "definition", identifier: String(jsonAttr(node, "identifier") ?? ""), label: String(jsonAttr(node, "label") ?? "") || null, url: String(jsonAttr(node, "url") ?? ""), title: String(jsonAttr(node, "title") ?? "") || null };
    case "table": return { type: "table", align: (jsonAttr(node, "align") as Array<"left" | "right" | "center" | ""> | undefined)?.map((value) => value || null), children };
    case "tableRow": return { type: "tableRow", children };
    case "tableCell": return { type: "tableCell", children };
    case "opaque": return { type: "mdfnRaw", value: node.source?.raw ?? node.text ?? "" };
    default: return { type: "mdfnRaw", value: node.source?.raw ?? node.text ?? "" };
  }
}

function stringifyMdast(root: MdastNode, dialect: MarkdownDialect): string {
  const handlers = {
    mdfnRaw(node: MdastNode): string { return node.value ?? ""; },
  };
  return toMarkdown(root as never, {
    extensions: dialect === "gfm" ? [gfmToMarkdown()] : [],
    handlers: handlers as never,
  });
}

function isDirty(node: MdfnNode): boolean {
  return Boolean(node.source?.dirty) || (node.content?.some(isDirty) ?? false);
}

function normalizeRegion(value: string, original: string): string {
  if (original.endsWith("\n") && !value.endsWith("\n")) return `${value}\n`;
  if (!original.endsWith("\n") && value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export function serializeMarkdown(input: MarkdownSerializeInput): SerializeResult {
  const options = input.options ?? {};
  const registry = resolveRegistry(options);
  const dialect = options.dialect ?? "gfm";
  const diagnostics: MdfnDiagnostic[] = [];
  if (!isDirty(input.document)) {
    return {
      markdown: input.originalSource,
      diagnostics,
      preservation: { exactUntouched: true, semanticSupported: true, opaqueUnsupported: true, touchedRegionOnly: true },
    };
  }

  const nodes = input.document.content;
  const patchable = nodes.every((node) => {
    const span = node.source;
    return span && span.from >= 0 && span.to >= span.from && span.to <= input.originalSource.length && (!span.raw || input.originalSource.slice(span.from, span.to) === span.raw);
  });
  if (patchable) {
    let output = input.originalSource;
    for (const node of [...nodes].sort((a, b) => (b.source?.from ?? 0) - (a.source?.from ?? 0))) {
      if (!isDirty(node)) continue;
      const span = node.source!;
      if (node.type === "opaque") {
        diagnostics.push(diagnostic("MDFN_OPAQUE_EDIT_UNSUPPORTED", "Opaque content remained unchanged because no active extension can serialize the edit", "error", { from: span.from, to: span.to }));
        continue;
      }
      const replacement = normalizeRegion(
        stringifyMdast({ type: "root", children: [convertNodeToMdast(node, registry)] }, dialect),
        input.originalSource.slice(span.from, span.to),
      );
      output = `${output.slice(0, span.from)}${replacement}${output.slice(span.to)}`;
    }
    return {
      markdown: output,
      diagnostics,
      preservation: { exactUntouched: false, semanticSupported: true, opaqueUnsupported: true, touchedRegionOnly: true },
    };
  }

  const markdown = stringifyMdast({ type: "root", children: nodes.map((node) => convertNodeToMdast(node, registry)) }, dialect);
  diagnostics.push(diagnostic("MDFN_DOCUMENT_NORMALIZED", "Structural changes required whole-document semantic serialization", "info"));
  return {
    markdown,
    diagnostics,
    preservation: { exactUntouched: false, semanticSupported: true, opaqueUnsupported: true, touchedRegionOnly: false },
  };
}

export function formatMarkdown(source: string, options: MarkdownOptions = {}): SerializeResult {
  const parsed = parseMarkdown(source, options);
  const dirtyDocument: MdfnDocument = {
    ...parsed.document,
    content: parsed.document.content.map((node) => ({ ...node, source: node.source ? { ...node.source, dirty: true } : undefined })),
  };
  return serializeMarkdown({ document: dirtyDocument, originalSource: "", options });
}

export function createMarkdownProjector(options: MarkdownOptions = {}): EditorProjector {
  return {
    parse(markdown) {
      return parseMarkdown(markdown, options);
    },
    serialize(document, originalMarkdown) {
      return serializeMarkdown({ document, originalSource: originalMarkdown, options });
    },
  };
}

export const MDFN_MARKDOWN_VERSION = "0.1.0" as const;
