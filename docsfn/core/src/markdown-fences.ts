export interface FenceState {
  marker: "`" | "~";
  length: number;
  quoteDepth: number;
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

export function splitMarkdownContainerPrefix(line: string): {
  quoteDepth: number;
  content: string;
} {
  const quoted = splitBlockQuotePrefix(line);
  const listMatch = quoted.content.match(LIST_ITEM_MARKER_REGEX);
  if (!listMatch) {
    return quoted;
  }
  return {
    quoteDepth: quoted.quoteDepth,
    content: quoted.content.slice(listMatch[0].length),
  };
}

export function matchFenceLine(line: string): FenceLineMatch | null {
  const { quoteDepth, content } = splitMarkdownContainerPrefix(line);
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
    const { quoteDepth } = splitBlockQuotePrefix(line);
    if (fence && quoteDepth < fence.quoteDepth) {
      fence = null;
    }
    const fenceMatch = matchFenceLine(line);
    if (!fence && fenceMatch) {
      fence = {
        marker: fenceMatch.marker,
        length: fenceMatch.length,
        quoteDepth: fenceMatch.quoteDepth,
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
