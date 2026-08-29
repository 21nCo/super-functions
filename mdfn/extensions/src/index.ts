import type { MdfnDocument, MdfnExtension, MdfnNode } from "@mdfn/core";

const exactPreservation = {
  noEdit: "exact",
  edited: "touched-region",
  unsupported: "opaque",
} as const;

export const commonmarkExtension: MdfnExtension = {
  name: "commonmark",
  version: "1.0.0",
  schema: {
    nodes: ["doc", "paragraph", "heading", "blockquote", "list", "listItem", "codeBlock", "inlineCode", "thematicBreak", "hardBreak", "text", "strong", "emphasis", "link", "image", "opaque"],
    marks: ["strong", "emphasis", "code", "link"],
  },
  preservation: exactPreservation,
  security: { allowsRawHtml: false, urlSchemes: ["http", "https", "mailto"] },
};

export const gfmExtension: MdfnExtension = {
  name: "gfm",
  version: "1.0.0",
  dependencies: ["commonmark"],
  schema: { nodes: ["table", "tableRow", "tableCell", "taskListItem", "delete"], marks: ["delete"] },
  preservation: exactPreservation,
  security: { allowsRawHtml: false, urlSchemes: ["http", "https", "mailto"] },
};

export interface DirectiveExtensionOptions {
  readonly name: string;
  readonly label?: string;
  readonly className?: string;
  readonly version?: string;
}

function directiveName(value: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new TypeError(`MDFN_DIRECTIVE_NAME_INVALID:${value}`);
  return value;
}

export function createDirectiveExtension(options: DirectiveExtensionOptions): MdfnExtension {
  const name = directiveName(options.name);
  const nodeType = `directive-${name}`;
  return {
    name: `directive/${name}`,
    version: options.version ?? "1.0.0",
    dependencies: ["commonmark"],
    schema: { nodes: [nodeType] },
    preservation: exactPreservation,
    security: { allowsRawHtml: false },
    parseMarkdown({ source, offset, line }) {
      const opening = new RegExp(`^:::[ \\t]*${name}(?:[ \\t]+([^\\r\\n]*?))?[ \\t]*(?:\\r?\\n|\\r|$)`).exec(line);
      if (!opening) return null;
      const searchFrom = offset + line.length;
      const closePattern = /^:{3,}[ \t]*(?:\r?\n|\r|$)/gm;
      closePattern.lastIndex = searchFrom;
      const close = closePattern.exec(source);
      const closeEnd = close ? close.index + close[0].length : source.length;
      const bodyEnd = close?.index ?? source.length;
      const body = source.slice(searchFrom, bodyEnd).replace(/\r?\n$/, "");
      return {
        consumed: closeEnd - offset,
        node: {
          type: nodeType,
          attrs: { name, label: opening[1]?.trim() || options.label || name },
          text: body,
        },
        diagnostics: close ? [] : [{ code: "MDFN_DIRECTIVE_UNCLOSED", message: `Directive ${name} has no closing fence`, severity: "warning", source: { from: offset, to: source.length }, extension: `directive/${name}` }],
      };
    },
    serializeMarkdown({ node }) {
      if (node.type !== nodeType) return null;
      const label = typeof node.attrs?.label === "string" && node.attrs.label !== name ? ` ${node.attrs.label}` : "";
      return `:::${name}${label}\n${node.text ?? ""}\n:::`;
    },
    render({ node }) {
      if (node.type !== nodeType) return null;
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : options.label ?? name;
      const classes = ["mdfn-directive", `mdfn-directive-${name}`, options.className].filter(Boolean).join(" ");
      return {
        tag: "aside",
        attrs: { class: classes, "data-md-directive": name },
        children: [
          { tag: "strong", text: label },
          { tag: "p", text: node.text ?? "" },
        ],
      };
    },
    visual({ node }) {
      if (node.type !== nodeType) return null;
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : options.label ?? name;
      return {
        tag: "aside",
        attrs: { class: "mdfn-directive-visual", "data-md-directive": name },
        children: [
          { tag: "strong", text: label },
          { tag: "p", text: node.text ?? "" },
        ],
      };
    },
    diagnostics(document) {
      const diagnostics: Array<{ code: string; message: string; severity: "warning"; nodeId?: string; extension: string }> = [];
      const visit = (node: MdfnNode): void => {
        if (node.type === nodeType && !(node.text ?? "").trim()) diagnostics.push({ code: "MDFN_DIRECTIVE_EMPTY", message: `Directive ${name} is empty`, severity: "warning", nodeId: node.id, extension: `directive/${name}` });
        node.content?.forEach(visit);
      };
      visit(document);
      return diagnostics;
    },
    migrations: [{
      from: 1,
      to: 2,
      migrate(document: MdfnDocument): MdfnDocument {
        const migrate = (node: MdfnNode): MdfnNode => node.type === `callout-${name}`
          ? { ...node, type: nodeType }
          : { ...node, content: node.content?.map(migrate) };
        return { ...migrate(document), type: "doc", schemaVersion: 2 } as MdfnDocument;
      },
    }],
    certification: {
      schemaVersion: 1,
      fixtures: [`directive-${name}`],
      capabilities: ["parse", "serialize", "render", "visual", "diagnostics", "migrations", "security"],
    },
  };
}

export const calloutExtension = createDirectiveExtension({ name: "callout", label: "Callout" });
export const diagramExtension = createDirectiveExtension({ name: "diagram", label: "Diagram" });

export const defaultExtensions = Object.freeze([commonmarkExtension, gfmExtension]);
export const authoringExtensions = Object.freeze([commonmarkExtension, gfmExtension, calloutExtension, diagramExtension]);

export const MDFN_EXTENSIONS_VERSION = "0.1.0" as const;
