import type { ContentScriptConfig } from '../types.js';
import type { AnchorContext, ResolvedAnchorMount } from './anchors.js';
import { resolveAnchors } from './anchors.js';
import { MountRegistry } from './mountRegistry.js';

export interface MountContentScriptOptions extends AnchorContext {
  registry: MountRegistry;
  render: (mount: {
    moduleId: string;
    anchorKey: string;
    root: HTMLElement;
    styleTarget: HTMLElement | ShadowRoot;
    shadowRoot?: ShadowRoot;
  }) => void | (() => void);
}

export async function mountContentScript(
  contentScript: ContentScriptConfig,
  options: MountContentScriptOptions
): Promise<HTMLElement[]> {
  const resolvedAnchors = await resolveAnchors(contentScript, options);
  const mountedRoots: HTMLElement[] = [];
  const seenKeys = new Set<string>();

  for (const resolvedAnchor of resolvedAnchors) {
    seenKeys.add(resolvedAnchor.anchorKey);
    const mounted = mountSingleAnchor(contentScript, resolvedAnchor, options);
    mountedRoots.push(mounted);
  }

  for (const existing of options.registry.entriesForModule(contentScript.id)) {
    if (!seenKeys.has(existing.anchorKey) && !existing.anchor.isConnected) {
      options.registry.remove(contentScript.id, existing.anchorKey);
    }
  }

  return mountedRoots;
}

function mountSingleAnchor(
  contentScript: ContentScriptConfig,
  resolvedAnchor: ResolvedAnchorMount,
  options: MountContentScriptOptions
): HTMLElement {
  const existing = options.registry.get(contentScript.id, resolvedAnchor.anchorKey);

  if (existing && existing.anchor === resolvedAnchor.anchor && existing.root.isConnected) {
    ensureStyles(contentScript, existing.root, existing.styleTarget, existing.shadowRoot);
    return existing.root;
  }

  if (existing) {
    options.registry.remove(contentScript.id, resolvedAnchor.anchorKey);
  }

  const root = options.document.createElement('div');
  root.dataset.extfnModuleId = contentScript.id;
  root.dataset.extfnAnchorKey = resolvedAnchor.anchorKey;
  root.id = createMountRootId(contentScript.id, resolvedAnchor.anchorKey);

  let shadowRoot: ShadowRoot | undefined;
  let styleTarget: HTMLElement | ShadowRoot = root;

  if (contentScript.styleIsolation === 'shadow-root' || resolvedAnchor.mountMode === 'shadow') {
    shadowRoot = root.attachShadow({ mode: 'open' });
    styleTarget = shadowRoot;
  }

  attachRoot(resolvedAnchor.anchor, root, resolvedAnchor.mountMode);
  ensureStyles(contentScript, root, styleTarget, shadowRoot);

  const cleanup = options.render({
    moduleId: contentScript.id,
    anchorKey: resolvedAnchor.anchorKey,
    root,
    styleTarget,
    shadowRoot,
  });

  options.registry.register({
    moduleId: contentScript.id,
    anchorKey: resolvedAnchor.anchorKey,
    anchor: resolvedAnchor.anchor,
    root,
    shadowRoot,
    styleTarget,
    cleanup: typeof cleanup === 'function' ? cleanup : undefined,
  });

  return root;
}

export function ensureStyles(
  contentScript: ContentScriptConfig,
  root: HTMLElement,
  styleTarget: HTMLElement | ShadowRoot,
  shadowRoot?: ShadowRoot
): void {
  if (contentScript.normalizeRootStyles) {
    root.style.boxSizing = 'border-box';
    root.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    root.style.fontSize = '14px';
    root.style.lineHeight = '1.4';
    root.style.color = 'rgb(17, 24, 39)';
  }

  if (contentScript.css && contentScript.css.length > 0) {
    const styleMarker = `${contentScript.id}:styles`;
    const styleHost = shadowRoot ?? styleTarget;
    const existingStyle = queryStyleHost(styleHost, styleMarker);
    if (!existingStyle) {
      const styleTag = root.ownerDocument.createElement('style');
      styleTag.dataset.extfnStyle = styleMarker;
      styleTag.textContent = contentScript.css.join('\n');

      if (shadowRoot) {
        shadowRoot.appendChild(styleTag);
      } else {
        styleTarget.appendChild(styleTag);
      }
    }
  }
}

export function createMountRootId(moduleId: string, anchorKey: string): string {
  const suffix = anchorKey.startsWith(`${moduleId}/`)
    ? anchorKey.slice(moduleId.length + 1)
    : anchorKey;
  return `extfn-root-${moduleId}${suffix === 'anchor-0' ? '' : `-${slugify(suffix)}`}`;
}

function attachRoot(anchor: Element, root: HTMLElement, mountMode: ResolvedAnchorMount['mountMode']): void {
  if (mountMode === 'prepend') {
    anchor.prepend(root);
    return;
  }

  if (mountMode === 'replace') {
    anchor.replaceWith(root);
    return;
  }

  anchor.append(root);
}

function queryStyleHost(
  target: HTMLElement | ShadowRoot,
  marker: string
): HTMLStyleElement | null {
  return target.querySelector(`style[data-extfn-style="${marker}"]`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
