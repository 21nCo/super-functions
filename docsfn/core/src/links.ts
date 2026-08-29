import type { CompiledContentArtifact, CompiledContentBlock } from "./types";

export interface ResolveMarkdownRelativeLinksInput {
  compiled: CompiledContentArtifact;
  route: string;
  sourcePath?: string;
  isIndexRoute?: boolean;
}

const HREF_ATTRIBUTE_REGEX = /(<a\b[^>]*\bhref=)(["'])([^"']+)\2/gi;
const EXTERNAL_OR_SPECIAL_HREF_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/|\{)/i;

export function resolveMarkdownRelativeLinks({
  compiled,
  route,
  sourcePath,
  isIndexRoute = false,
}: ResolveMarkdownRelativeLinksInput): CompiledContentArtifact {
  const baseRoute = resolveBaseRoute(route, sourcePath, isIndexRoute);

  return {
    ...compiled,
    blocks: resolveBlocks(compiled.blocks, baseRoute),
  };
}

function resolveBlocks(
  blocks: CompiledContentBlock[],
  baseRoute: string,
): CompiledContentBlock[] {
  return blocks.map((block) => {
    if ("html" in block) {
      return {
        ...block,
        html: resolveHtmlLinks(block.html, baseRoute),
      };
    }

    if (block.type === "tabs") {
      return {
        ...block,
        tabs: block.tabs.map((tab) => ({
          ...tab,
          nodes: resolveBlocks(tab.nodes, baseRoute),
        })),
      };
    }

    if (block.type === "component") {
      return {
        ...block,
        children: resolveBlocks(block.children, baseRoute),
      };
    }

    return block;
  });
}

function resolveHtmlLinks(html: string, baseRoute: string): string {
  return html.replace(HREF_ATTRIBUTE_REGEX, (match, prefix, quote, href) => {
    if (EXTERNAL_OR_SPECIAL_HREF_REGEX.test(href)) {
      return match;
    }

    const resolvedHref = resolveHref(href, baseRoute);
    return `${prefix}${quote}${resolvedHref}${quote}`;
  });
}

function resolveHref(href: string, baseRoute: string): string {
  try {
    const resolved = new URL(href, `https://docs.local${baseRoute}/`);
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return href;
  }
}

function resolveBaseRoute(
  route: string,
  sourcePath: string | undefined,
  isIndexRoute: boolean,
): string {
  const normalizedRoute = normalizeAbsolutePath(route);

  if (isIndexRoute || (sourcePath && /(?:^|\/)index\.mdx?$/i.test(sourcePath))) {
    return normalizedRoute;
  }

  const separatorIndex = normalizedRoute.lastIndexOf("/");
  if (separatorIndex <= 0) {
    return "/";
  }

  return normalizedRoute.slice(0, separatorIndex);
}

function normalizeAbsolutePath(path: string): string {
  const prefixed = path.startsWith("/") ? path : `/${path}`;
  let end = prefixed.length;
  while (end > 1 && prefixed.charCodeAt(end - 1) === 47) end -= 1;
  return prefixed.slice(0, end);
}
