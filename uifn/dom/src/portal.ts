import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomRoot, UIFnDomScope } from './scope';

export type UIFnPortalTarget = Element | ShadowRoot | string | (() => Element | ShadowRoot | null);

export interface UIFnPortalOptions {
  readonly id: string;
  readonly node: Node;
  readonly target?: UIFnPortalTarget;
  readonly disabled?: boolean;
  readonly restoreOnDestroy?: boolean;
  readonly registerBranch?: (element: Element) => () => void;
}

export interface UIFnPortalHandle {
  readonly id: string;
  readonly mounted: boolean;
  readonly target: Element | ShadowRoot | null;
  update(options: Partial<Omit<UIFnPortalOptions, 'id' | 'node'>>): void;
  destroy(): void;
}

function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && (value as Node).nodeType === 1;
}

function escapeAttribute(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function isDomScope(value: UIFnDomScope | UIFnDomRoot): value is UIFnDomScope {
  return 'document' in value && 'environment' in value && 'query' in value;
}

export function resolveUIFnPortalTarget(
  scopeOrRoot: UIFnDomScope | UIFnDomRoot,
  target?: UIFnPortalTarget,
): Element | ShadowRoot | null {
  if (typeof target === 'function') return target();
  const root = isDomScope(scopeOrRoot) ? scopeOrRoot.root : scopeOrRoot;
  const document = isDomScope(scopeOrRoot)
    ? scopeOrRoot.document
    : root.nodeType === 9
      ? root as Document
      : root.ownerDocument;
  if (typeof target === 'string') return root.querySelector(target);
  if (target) return target;
  if (root.nodeType === 11) return root as ShadowRoot;
  return document?.body ?? document?.documentElement ?? null;
}

export function createUIFnPortal(
  scope: UIFnDomScope,
  initialOptions: UIFnPortalOptions,
): UIFnPortalHandle {
  scope.assertAlive('create portal');
  let options = initialOptions;
  let destroyed = false;
  let mountedTarget: Element | ShadowRoot | null = null;
  let releaseBranch: () => void = () => undefined;
  const node = options.node;
  const originalParent = node.parentNode;
  const originalNextSibling = node.nextSibling;
  const placeholder = scope.document.createComment(`uifn-portal:${options.id}`);
  if (originalParent) originalParent.insertBefore(placeholder, node);
  const element = isElement(node) ? node : null;
  const previousPortalId = element?.getAttribute('data-uifn-portal-id') ?? null;
  const releaseResource = scope.track('portal', () => undefined, options.id);

  const assertAlive = (operation: string) => {
    scope.assertAlive(operation);
    if (!destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'Portal',
      message: `Cannot ${operation} after the portal is destroyed.`,
    });
  };

  const move = () => {
    const target = resolveUIFnPortalTarget(scope, options.target);
    releaseBranch();
    releaseBranch = () => undefined;
    if (options.disabled || !target) {
      if (!options.disabled && !target) {
        throw createUIFnError({
          code: 'UIFN_DOM_SCOPE_INVALID',
          package: '@uifn/dom',
          component: 'Portal',
          message: `Portal ${options.id} could not resolve its target in the injected root.`,
          details: { portalId: options.id },
        });
      }
      if (originalParent && placeholder.parentNode === originalParent) {
        originalParent.insertBefore(node, placeholder.nextSibling);
      }
      mountedTarget = null;
      return;
    }
    if (element) {
      const selector = `[data-uifn-portal-id="${escapeAttribute(options.id)}"]`;
      const duplicate = target.querySelector<Element>(selector) ?? scope.query<Element>(selector);
      if (duplicate && duplicate !== element) {
        throw createUIFnError({
          code: 'UIFN_PORTAL_HYDRATION_DUPLICATE',
          package: '@uifn/dom',
          component: 'Portal',
          message: `Portal ${options.id} would create a duplicate hydrated node.`,
          details: { portalId: options.id },
        });
      }
      element.setAttribute('data-uifn-portal-id', options.id);
    }
    target.appendChild(node);
    // Register after the move so shadow-root ownership and composed ancestry are
    // observable to the branch callback.
    if (element && options.registerBranch) releaseBranch = options.registerBranch(element);
    mountedTarget = target;
    scope.environment.trace({
      kind: 'dom-portal',
      operation: 'mount',
      timestamp: scope.environment.now(),
      details: { portalId: options.id, targetNodeName: target.nodeName },
    });
  };

  try {
    move();
  } catch (error) {
    releaseBranch();
    if (element) {
      if (previousPortalId === null) element.removeAttribute('data-uifn-portal-id');
      else element.setAttribute('data-uifn-portal-id', previousPortalId);
    }
    if (originalParent) originalParent.insertBefore(node, placeholder.nextSibling);
    placeholder.remove();
    releaseResource();
    throw error;
  }

  return {
    id: options.id,
    get mounted() {
      return mountedTarget !== null;
    },
    get target() {
      return mountedTarget;
    },
    update(next) {
      assertAlive('update portal');
      options = { ...options, ...next };
      move();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseBranch();
      if (element) {
        if (previousPortalId === null) element.removeAttribute('data-uifn-portal-id');
        else element.setAttribute('data-uifn-portal-id', previousPortalId);
      }
      if (options.restoreOnDestroy !== false && originalParent) {
        const reference = originalNextSibling?.parentNode === originalParent
          ? originalNextSibling
          : placeholder.parentNode === originalParent
            ? placeholder.nextSibling
            : null;
        originalParent.insertBefore(node, reference);
      } else {
        (node as Node & ChildNode).remove();
      }
      placeholder.remove();
      mountedTarget = null;
      releaseResource();
    },
  };
}
