import { validateMdfnSidecar, type MdfnDiagnostic, type MdfnSidecar, type MdfnSnapshot } from "@mdfn/core";

export interface MarkdownContentProfile {
  readonly id: string;
  readonly dialect: "commonmark" | "gfm";
  readonly allowRawHtml: boolean;
  readonly extensions: readonly string[];
  readonly schemaVersion: number;
}

export interface MarkdownContent {
  readonly type: "text/markdown";
  readonly version: 1;
  readonly markdown: string;
  readonly profile: MarkdownContentProfile;
  readonly schemaHash?: string;
  readonly sidecar?: MdfnSidecar;
}

export const defaultMarkdownContentProfile: MarkdownContentProfile = Object.freeze({
  id: "mdfn:gfm",
  dialect: "gfm",
  allowRawHtml: false,
  extensions: Object.freeze([]),
  schemaVersion: 1,
});

export function markdownContent(
  markdown: string,
  options: Partial<Omit<MarkdownContent, "type" | "version" | "markdown">> = {},
): MarkdownContent {
  return Object.freeze({
    type: "text/markdown",
    version: 1,
    markdown,
    profile: Object.freeze({ ...defaultMarkdownContentProfile, ...(options.profile ?? {}) }),
    schemaHash: options.schemaHash,
    sidecar: options.sidecar,
  });
}

export function snapshotToContent(snapshot: MdfnSnapshot, profile: MarkdownContentProfile = defaultMarkdownContentProfile): MarkdownContent {
  return markdownContent(snapshot.markdown, { profile, schemaHash: snapshot.schemaHash, sidecar: snapshot.sidecar });
}

export function isMarkdownContent(value: unknown): value is MarkdownContent {
  const candidate = value as Partial<MarkdownContent> | null;
  const profile = candidate?.profile as Partial<MarkdownContentProfile> | undefined;
  const shapeValid = candidate?.type === "text/markdown"
    && candidate.version === 1
    && typeof candidate.markdown === "string"
    && typeof profile?.id === "string"
    && (profile.dialect === "commonmark" || profile.dialect === "gfm")
    && typeof profile.allowRawHtml === "boolean"
    && Array.isArray(profile.extensions)
    && profile.extensions.every((extension) => typeof extension === "string")
    && Number.isInteger(profile.schemaVersion)
    && (profile.schemaVersion ?? 0) > 0
    && (candidate.schemaHash === undefined || typeof candidate.schemaHash === "string");
  if (!shapeValid) return false;
  try {
    validateMdfnSidecar(candidate.sidecar, { markdownLength: candidate.markdown!.length });
    return true;
  } catch {
    return false;
  }
}

export interface ContentMigrationDiagnostic {
  readonly code: "MDFN_CONTENT_MIGRATED_STRING" | "MDFN_CONTENT_MIGRATED_LEGACY_MARKDOWN" | "MDFN_CONTENT_LEGACY_METADATA_DROPPED" | "MDFN_CONTENT_RICHTEXT_LOSSY" | "MDFN_CONTENT_UNSUPPORTED";
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
}

export interface ContentMigrationResult {
  readonly content: MarkdownContent;
  readonly diagnostics: readonly ContentMigrationDiagnostic[];
  readonly lossy: boolean;
}

function opaqueMigrationComment(value: unknown): string {
  const visited = new WeakSet<object>();
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (_key, entry: unknown) => {
      if (typeof entry === "bigint") return { $mdfnType: "bigint", value: entry.toString() };
      if (entry && typeof entry === "object") {
        if (visited.has(entry)) return { $mdfnType: "circular" };
        visited.add(entry);
      }
      return entry;
    }) ?? String(value);
  } catch {
    serialized = String(value);
  }

  // Percent encoding makes the retained payload inert inside an HTML comment.
  // Hyphens are encoded separately because encodeURIComponent leaves them bare.
  const encoded = encodeURIComponent(serialized).replaceAll("-", "%2D");
  return `<!-- mdfn-migration-opaque:${encoded} -->`;
}

interface RichTextProjection {
  readonly text: string;
  readonly opaque: readonly string[];
  readonly unsupported: number;
}

function textFromRichNode(value: unknown, ancestors = new WeakSet<object>(), depth = 0): RichTextProjection {
  if (typeof value === "string") return { text: value, opaque: [], unsupported: 0 };
  if (!value || typeof value !== "object") return { text: "", opaque: [opaqueMigrationComment(value)], unsupported: 1 };
  if (depth >= 64 || ancestors.has(value)) return { text: "", opaque: [opaqueMigrationComment(value)], unsupported: 1 };
  const node = value as Record<string, unknown>;
  // WeakSet is not iterable, so add/remove on the current traversal path.
  ancestors.add(value);
  try {
    const ownText = typeof node.text === "string" ? node.text : "";
    if (node.children === undefined) {
      return ownText
        ? { text: ownText, opaque: [], unsupported: 0 }
        : { text: "", opaque: [opaqueMigrationComment(value)], unsupported: 1 };
    }
    if (!Array.isArray(node.children)) return { text: ownText, opaque: [opaqueMigrationComment(node.children)], unsupported: 1 };
    const children = node.children.map((child) => textFromRichNode(child, ancestors, depth + 1));
    return {
      text: ownText + children.map((child) => child.text).join(""),
      opaque: children.flatMap((child) => child.opaque),
      unsupported: children.reduce((total, child) => total + child.unsupported, 0),
    };
  } finally {
    ancestors.delete(value);
  }
}

function richBlocksToMarkdown(value: readonly unknown[]): { markdown: string; unsupported: number } {
  let unsupported = 0;
  const blocks = value.map((entry) => {
    if (!entry || typeof entry !== "object") { unsupported += 1; return opaqueMigrationComment(entry); }
    const block = entry as Record<string, unknown>;
    const type = typeof block.type === "string" ? block.type : "paragraph";
    if (type !== "paragraph" && !/^h[1-6]$/.test(type) && type !== "blockquote" && type !== "code" && type !== "list-item") {
      unsupported += 1;
      return opaqueMigrationComment(entry);
    }
    const projected = textFromRichNode(block);
    unsupported += projected.unsupported;
    const retained = projected.opaque.join("\n\n");
    const withOpaque = (markdown: string): string => retained ? `${markdown}\n\n${retained}` : markdown;
    if (type === "paragraph") return withOpaque(projected.text);
    if (/^h[1-6]$/.test(type)) return withOpaque(`${"#".repeat(Number(type[1]))} ${projected.text}`);
    if (type === "blockquote") return withOpaque(projected.text.split("\n").map((line) => `> ${line}`).join("\n"));
    if (type === "code") return withOpaque(`\`\`\`${typeof block.language === "string" ? block.language : ""}\n${projected.text}\n\`\`\``);
    if (type === "list-item") return withOpaque(`- ${projected.text}`);
    return opaqueMigrationComment(entry);
  });
  return { markdown: blocks.join("\n\n"), unsupported };
}

export function migrateToMarkdownContent(
  value: unknown,
  profile: MarkdownContentProfile = defaultMarkdownContentProfile,
): ContentMigrationResult {
  if (isMarkdownContent(value)) {
    return { content: value, diagnostics: [], lossy: false };
  }
  if (typeof value === "string") {
    return {
      content: markdownContent(value, { profile }),
      diagnostics: [{ code: "MDFN_CONTENT_MIGRATED_STRING", severity: "info", message: "Legacy string was wrapped as versioned Markdown content" }],
      lossy: false,
    };
  }
  if (value && typeof value === "object" && (value as { type?: unknown }).type === "text/markdown" && typeof (value as { markdown?: unknown }).markdown === "string") {
    const legacy = value as { markdown: string; schemaHash?: unknown; sidecar?: unknown };
    const schemaHash = typeof legacy.schemaHash === "string" ? legacy.schemaHash : undefined;
    let sidecar: MdfnSidecar | undefined;
    let invalidMetadata = legacy.schemaHash !== undefined && schemaHash === undefined;
    if (legacy.sidecar !== undefined) {
      try {
        validateMdfnSidecar(legacy.sidecar as MdfnSidecar, { markdownLength: legacy.markdown.length });
        sidecar = legacy.sidecar as MdfnSidecar;
      } catch {
        invalidMetadata = true;
      }
    }
    return {
      content: markdownContent(legacy.markdown, { profile, schemaHash, sidecar }),
      diagnostics: [
        { code: "MDFN_CONTENT_MIGRATED_LEGACY_MARKDOWN", severity: "info", message: "Legacy Markdown envelope was upgraded to version 1 with an explicit profile" },
        ...(invalidMetadata ? [{ code: "MDFN_CONTENT_LEGACY_METADATA_DROPPED" as const, severity: "warning" as const, message: "Invalid legacy Markdown metadata was omitted during migration" }] : []),
      ],
      lossy: invalidMetadata,
    };
  }
  if (Array.isArray(value)) {
    const projected = richBlocksToMarkdown(value);
    return {
      content: markdownContent(projected.markdown, { profile }),
      diagnostics: projected.unsupported > 0 ? [{ code: "MDFN_CONTENT_RICHTEXT_LOSSY", severity: "warning", message: `${projected.unsupported} rich-text blocks were retained as opaque migration comments` }] : [],
      lossy: projected.unsupported > 0,
    };
  }
  return {
    content: markdownContent("", { profile }),
    diagnostics: [{ code: "MDFN_CONTENT_UNSUPPORTED", severity: "error", message: "Content value cannot be migrated to Markdown" }],
    lossy: true,
  };
}

export function mergeMigrationDiagnostics(content: MarkdownContent, diagnostics: readonly MdfnDiagnostic[]): MarkdownContent {
  if (diagnostics.some((entry) => entry.severity === "error")) throw new Error("MDFN_CONTENT_PROFILE_VALIDATION_FAILED");
  return content;
}

export const MDFN_CONTENTFN_VERSION = "0.1.0" as const;
