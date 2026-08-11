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

const cachedNameAnchorKeys = new WeakMap<Element, Map<string, string>>();

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
  const explicitKey =
    anchor.getAttribute('data-extfn-anchor-key') ??
    anchor.getAttribute('data-testid') ??
    // `anchor.id` is always a string ('' when the attribute is absent), so the
    // empty string must be treated as "no id" to fall through to `name`.
    (anchor.id !== '' ? anchor.id : null);

  if (explicitKey) {
    return `${moduleId}/${explicitKey}`;
  }
  if (explicitKey === '') {
    return `${moduleId}/anchor-${index}`;
  }

  const name = anchor.getAttribute('name');
  if (name) {
    const key = getStableNameAnchorKey(moduleId, anchor, name, index);
    return `${moduleId}/${key}`;
  }

  return `${moduleId}/anchor-${index}`;
}

function getStableNameAnchorKey(
  moduleId: string,
  anchor: Element,
  name: string,
  index: number
): string {
  const cachedKey = cachedNameAnchorKeys.get(anchor)?.get(moduleId);
  if (cachedKey) {
    return cachedKey;
  }

  const namedAnchors = Array.from(anchor.ownerDocument.getElementsByName(name));
  const usedKeys = new Set(
    namedAnchors
      .map((candidate) => cachedNameAnchorKeys.get(candidate)?.get(moduleId))
      .filter((key): key is string => key !== undefined)
  );

  let key = name;
  if (namedAnchors.length > 1 || usedKeys.has(key)) {
    let suffix = index;
    while (usedKeys.has(`${name}-${suffix}`)) {
      suffix += 1;
    }
    key = `${name}-${suffix}`;
  }

  const elementKeys = cachedNameAnchorKeys.get(anchor) ?? new Map();
  elementKeys.set(moduleId, key);
  cachedNameAnchorKeys.set(anchor, elementKeys);
  return key;
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
