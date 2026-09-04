export interface FenceState {
  marker: "`" | "~";
  length: number;
  quoteDepth: number;
  containerIndent: number;
}

export interface FenceLineMatch {
  marker: "`" | "~";
  length: number;
  info: string;
  quoteDepth: number;
}

export function splitBlockQuotePrefix(line: string): {
  quoteDepth: number;
  content: string;
} {
  let quoteDepth = 0;
  let content = line;
  while (true) {
    const match = content.match(/^ {0,3}> ?/);
    if (!match) {
      break;
    }
    quoteDepth += 1;
    content = content.slice(match[0].length);
  }
  return { quoteDepth, content };
}

const LIST_ITEM_MARKER_REGEX = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: |\t)/;

function stripLeadingContainerIndent(line: string, indent: number): string {
  if (indent <= 0) {
    return line;
  }
  let consumed = 0;
  let index = 0;
  while (index < line.length && consumed < indent) {
    const character = line[index];
    if (character !== " " && character !== "\t") {
      break;
    }
    consumed += 1;
    index += 1;
  }
  return line.slice(index);
}

export function splitMarkdownContainerPrefix(line: string): {
  quoteDepth: number;
  content: string;
  containerIndent: number;
} {
  let quoteDepth = 0;
  let content = line;
  let containerIndent = 0;
  while (true) {
    const quoteMatch = content.match(/^ {0,3}> ?/);
    if (quoteMatch) {
      quoteDepth += 1;
      content = content.slice(quoteMatch[0].length);
      containerIndent += quoteMatch[0].length;
      continue;
    }
    const listMatch = content.match(LIST_ITEM_MARKER_REGEX);
    if (listMatch) {
      content = content.slice(listMatch[0].length);
      containerIndent += listMatch[0].length;
      continue;
    }
    break;
  }
  return { quoteDepth, content, containerIndent };
}

export function matchFenceLine(line: string, containerIndent = 0): FenceLineMatch | null {
  const remaining = stripLeadingContainerIndent(line, containerIndent);
  const { quoteDepth, content } = splitMarkdownContainerPrefix(remaining);
  const match = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }
  const fence = match[1];
  const marker = fence[0] as "`" | "~";
  const info = match[2] ?? "";
  if (marker === "`" && info.includes("`")) {
    return null;
  }
  return { marker, length: fence.length, info, quoteDepth };
}

export function isClosingFence(open: FenceState, candidate: FenceLineMatch): boolean {
  return (
    candidate.marker === open.marker &&
    candidate.length >= open.length &&
    candidate.quoteDepth === open.quoteDepth &&
    /^[ \t]*$/.test(candidate.info)
  );
}

export function scanFenceLines(
  lines: string[],
  onLine: (line: string, inFence: boolean, isFenceLine: boolean) => void
): void {
  let fence: FenceState | null = null;
  for (const line of lines) {
    const { quoteDepth } = splitMarkdownContainerPrefix(line);
    if (fence && quoteDepth < fence.quoteDepth) {
      fence = null;
    }
    const fenceMatch = matchFenceLine(line, fence?.containerIndent ?? 0);
    if (!fence && fenceMatch) {
      fence = {
        marker: fenceMatch.marker,
        length: fenceMatch.length,
        quoteDepth: fenceMatch.quoteDepth,
        containerIndent: splitMarkdownContainerPrefix(line).containerIndent,
      };
      onLine(line, true, true);
      continue;
    }
    if (fence && fenceMatch && isClosingFence(fence, fenceMatch)) {
      onLine(line, true, true);
      fence = null;
      continue;
    }
    onLine(line, fence !== null, false);
  }
}
