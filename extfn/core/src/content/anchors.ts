import { createExtfnError } from '../errors.js';
import type {
  AnchorStrategy,
  ContentMountMode,
  ContentScriptConfig,
} from '../types.js';

export interface AnchorContext {
  document: Document;
  moduleId: string;
  resolverLoader?: (
    exportName: string
  ) => Promise<(document: Document) => Iterable<Element> | Element | null | undefined>;
  logger?: (error: unknown) => void;
}

export interface ResolvedAnchorMount {
  anchor: Element;
  anchorKey: string;
  mountMode: ContentMountMode;
}

export async function resolveAnchors(
  contentScript: ContentScriptConfig,
  context: AnchorContext
): Promise<ResolvedAnchorMount[]> {
  const strategies = contentScript.anchors ?? [];
  if (strategies.length === 0) {
    return [];
  }

  const resolved: ResolvedAnchorMount[] = [];

  for (const strategy of strategies) {
    if (strategy.kind === 'selector') {
      const anchor = context.document.querySelector(strategy.selector);
      if (!anchor) {
        continue;
      }

      resolved.push({
        anchor,
        anchorKey: createAnchorKey(contentScript.id, anchor, resolved.length),
        mountMode: strategy.mountMode,
      });
      continue;
    }

    if (strategy.kind === 'selector-list') {
      const anchors = Array.from(
        context.document.querySelectorAll(strategy.selector)
      );
      anchors.forEach((anchor, index) => {
        resolved.push({
          anchor,
          anchorKey: createAnchorKey(contentScript.id, anchor, index),
          mountMode: strategy.mountMode,
        });
      });
      continue;
    }

    await resolveResolverAnchors(contentScript, strategy, context, resolved);
  }

  return resolved;
}

export function createAnchorKey(
  moduleId: string,
  anchor: Element,
  index: number
): string {
  const preferred =
    anchor.getAttribute('data-extfn-anchor-key') ??
    anchor.getAttribute('data-testid') ??
    anchor.id ??
    anchor.getAttribute('name');

  if (preferred) {
    return `${moduleId}/${preferred}`;
  }

  return `${moduleId}/anchor-${index}`;
}

async function resolveResolverAnchors(
  contentScript: ContentScriptConfig,
  strategy: Extract<AnchorStrategy, { kind: 'resolver' }>,
  context: AnchorContext,
  resolved: ResolvedAnchorMount[]
): Promise<void> {
  if (!context.resolverLoader) {
    throw createExtfnError(
      'E_ANCHOR_RESOLUTION',
      `Resolver loader is unavailable for ${contentScript.id}/${strategy.exportName}`
    );
  }

  try {
    const resolver = await context.resolverLoader(strategy.exportName);
    const output = resolver(context.document);
    const anchors = normalizeResolverResult(output);

    anchors.forEach((anchor, index) => {
      resolved.push({
        anchor,
        anchorKey: createAnchorKey(contentScript.id, anchor, index),
        mountMode: strategy.mountMode,
      });
    });
  } catch (error) {
    context.logger?.(
      createExtfnError(
        'E_ANCHOR_RESOLUTION',
        error instanceof Error ? error.message : 'Anchor resolver failed.',
        { id: contentScript.id, exportName: strategy.exportName }
      )
    );
  }
}

function normalizeResolverResult(
  value: Iterable<Element> | Element | null | undefined
): Element[] {
  if (!value) {
    return [];
  }

  if (isElementNode(value)) {
    return [value];
  }

  return Array.from(value).filter(isElementNode);
}

function isElementNode(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nodeType' in value &&
    (value as { nodeType: number }).nodeType === 1
  );
}
