import { createDiagnostic, createDocsError } from "./diagnostics";

export const BLOCKED_HTML_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
] as const;

export const BLOCKED_HTML_PATTERNS = [
  { category: "event-handler", regex: /\son[a-z]+\s*=/i },
  { category: "javascript-url", regex: /javascript\s*:/i },
] as const;

export interface SanitizeSourceInput {
  source: string;
  sourcePath?: string;
  allowRawHtml?: boolean;
}

export interface UnsafeHtmlMatch {
  category: string;
  match: string;
}

function stripCodeExamples(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]+`/g, " ");
}

export function findUnsafeHtml(source: string): UnsafeHtmlMatch[] {
  const normalizedSource = stripCodeExamples(source);
  const matches: UnsafeHtmlMatch[] = [];

  for (const tag of BLOCKED_HTML_TAGS) {
    const regex = new RegExp(`<\\s*${tag}\\b`, "i");
    const found = normalizedSource.match(regex);
    if (found) {
      matches.push({ category: `blocked-tag:${tag}`, match: found[0] });
    }
  }

  for (const pattern of BLOCKED_HTML_PATTERNS) {
    const found = normalizedSource.match(pattern.regex);
    if (found) {
      matches.push({ category: pattern.category, match: found[0] });
    }
  }

  return matches;
}

export function assertSafeSource(input: SanitizeSourceInput): void {
  if (input.allowRawHtml) {
    return;
  }

  const matches = findUnsafeHtml(input.source);
  if (matches.length === 0) {
    return;
  }

  throw createDocsError({
    code: "DOCS_HTML_UNSAFE",
    message: "unsafe HTML content is blocked by default",
    diagnostics: [
      createDiagnostic({
        code: "DOCS_HTML_UNSAFE",
        message: "unsafe HTML content is blocked by default",
        location: {
          absolutePath: input.sourcePath,
        },
        details: {
          blockedCategories: matches.map((match) => match.category),
          matches,
        },
      }),
    ],
  });
}
