import { createDiagnostic, createDocsError } from "./diagnostics";
import { decodeHTML } from "entities";
import { marked, type Token } from "marked";

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

interface FenceState {
  marker: "`" | "~";
  length: number;
}

function splitBlockQuotePrefix(line: string): string {
  let content = line;
  while (true) {
    const match = content.match(/^ {0,3}> ?/);
    if (!match) {
      return content;
    }
    content = content.slice(match[0].length);
  }
}

function matchFenceLine(line: string): { marker: "`" | "~"; length: number; info: string } | null {
  const content = splitBlockQuotePrefix(line);
  const match = content.match(/^ {0,3}([`~]{3,})(.*)$/);
  if (!match) {
    return null;
  }
  const fence = match[1];
  const marker = fence[0] as "`" | "~";
  const info = match[2] ?? "";
  if (marker === "`" && info.includes("`")) {
    return null;
  }
  return { marker, length: fence.length, info };
}

function isClosingFence(
  open: FenceState,
  candidate: { marker: "`" | "~"; length: number; info: string }
): boolean {
  return (
    candidate.marker === open.marker &&
    candidate.length >= open.length &&
    /^[ \t]*$/.test(candidate.info)
  );
}

function stripInlineCode(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "`") {
      const next = source.indexOf("`", index);
      result += next === -1 ? source.slice(index) : source.slice(index, next);
      if (next === -1) {
        break;
      }
      index = next;
      continue;
    }
    let length = 1;
    while (index + length < source.length && source[index + length] === "`") {
      length += 1;
    }
    let cursor = index + length;
    let closer = -1;
    while (cursor < source.length) {
      if (source[cursor] !== "`") {
        cursor += 1;
        continue;
      }
      let run = 0;
      while (cursor + run < source.length && source[cursor + run] === "`") {
        run += 1;
      }
      if (run === length) {
        closer = cursor + run;
        break;
      }
      cursor += run;
    }
    if (closer === -1) {
      result += source.slice(index);
      break;
    }
    result += " ".repeat(closer - index);
    index = closer;
  }
  return result;
}

function stripCodeExamples(source: string): string {
  const kept: string[] = [];
  let fence: FenceState | null = null;
  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = matchFenceLine(line);
    if (!fence && fenceMatch) {
      fence = { marker: fenceMatch.marker, length: fenceMatch.length };
      kept.push("");
      continue;
    }
    if (fence && fenceMatch && isClosingFence(fence, fenceMatch)) {
      fence = null;
      kept.push("");
      continue;
    }
    if (fence) {
      kept.push("");
      continue;
    }
    kept.push(stripInlineCode(line));
  }
  return kept.join("\n");
}

function collectRawHtml(source: string): string {
  const html: string[] = [];
  marked.walkTokens(marked.lexer(source), (token: Token) => {
    if (token.type === "html") {
      html.push(token.raw);
    }
  });
  return html.join("\n");
}

export function findUnsafeHtml(source: string): UnsafeHtmlMatch[] {
  const scanText = `${collectRawHtml(source)}\n${stripCodeExamples(source)}`;
  const matches: UnsafeHtmlMatch[] = [];

  for (const tag of BLOCKED_HTML_TAGS) {
    const regex = new RegExp(`<\\s*${tag}(?=[\\s/>])`, "i");
    const found = scanText.match(regex);
    if (found) {
      matches.push({ category: `blocked-tag:${tag}`, match: found[0] });
    }
  }

  const decodedForUrls = decodeHTML(scanText);
  for (const pattern of BLOCKED_HTML_PATTERNS) {
    const found = decodedForUrls.match(pattern.regex);
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
          matches,
        },
      }),
    ],
  });
}
