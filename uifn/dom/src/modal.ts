import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomRoot, UIFnDomScope } from './scope';

export interface UIFnModalOptions {
  readonly id?: string;
  readonly content: HTMLElement | (() => HTMLElement | null);
  readonly branches?: readonly Element[];
  readonly isolate?: boolean;
  readonly disableOutsidePointerEvents?: boolean;
  readonly lockScroll?: boolean;
  readonly scrollTarget?: HTMLElement;
  readonly allowPinchZoom?: boolean;
}

export interface UIFnModalHandle {
  readonly id: string;
  readonly topmost: boolean;
  addBranch(element: Element): () => void;
  update(options: Partial<Omit<UIFnModalOptions, 'id'>>): void;
  destroy(): void;
}

export interface UIFnModalManager {
  readonly size: number;
  readonly topModalId: string | null;
  acquire(options: UIFnModalOptions): UIFnModalHandle;
  destroy(): void;
}

interface ModalRecord {
  readonly id: string;
  options: UIFnModalOptions;
  readonly branches: Set<Element>;
  readonly releaseResource: () => void;
  destroyed: boolean;
}

interface IsolationSnapshot {
  readonly ariaHidden: string | null;
  readonly hadInertAttribute: boolean;
  readonly inert: boolean;
  readonly pointerEvents: string;
}

interface ScrollSnapshot {
  readonly target: HTMLElement;
  readonly overflow: string;
  readonly paddingRight: string;
  readonly position: string;
  readonly top: string;
  readonly left: string;
  readonly right: string;
  readonly width: string;
  readonly touchAction: string;
  readonly scrollbarGutter: string;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly restoreScrollPosition: boolean;
  readonly releaseTouch: () => void;
  readonly releaseViewport: () => void;
}

function once(callback: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    callback();
  };
}

function resolveContent(record: ModalRecord): HTMLElement | null {
  return typeof record.options.content === 'function'
    ? record.options.content()
    : record.options.content;
}

function isolationContainer(root: UIFnDomRoot, document: Document): ParentNode & Node {
  if (root.nodeType === 9) return (document.body ?? document.documentElement) as ParentNode & Node;
  return root as ParentNode & Node;
}

function isProtected(element: Element, protectedElements: readonly Element[]): boolean {
  return protectedElements.some((allowed) =>
    element === allowed || element.contains(allowed) || allowed.contains(element));
}

function isIOS(window: Window): boolean {
  const navigator = window.navigator;
  return /iP(?:ad|hone|od)/.test(navigator.platform)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && (value as Node).nodeType === 1;
}

function touchCanScroll(scope: UIFnDomScope, event: TouchEvent, protectedElements: readonly Element[]): boolean {
  const path = event.composedPath();
  for (const target of path) {
    if (!isElement(target)) continue;
    if (!protectedElements.some((allowed) => allowed === target || allowed.contains(target))) continue;
    const element = target as HTMLElement;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const overflowY = style?.overflowY ?? '';
    const overflowX = style?.overflowX ?? '';
    if (
      ((/auto|scroll/.test(overflowY) && element.scrollHeight > element.clientHeight)
        || (/auto|scroll/.test(overflowX) && element.scrollWidth > element.clientWidth))
    ) return true;
  }
  return false;
}

export function createUIFnModalManager(scope: UIFnDomScope): UIFnModalManager {
  scope.assertAlive('create modal manager');
  const records: ModalRecord[] = [];
  const isolation = new Map<Element, IsolationSnapshot>();
  let scrollSnapshot: ScrollSnapshot | null = null;
  let sequence = 0;
  let destroyed = false;

  const assertManagerAlive = (operation: string, record?: ModalRecord) => {
    scope.assertAlive(operation);
    if (!destroyed && !record?.destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'ModalManager',
      message: `Cannot ${operation} after the modal service is destroyed.`,
    });
  };

  const top = () => {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (!record.destroyed) return record;
    }
    return null;
  };

  const activeProtected = (record: ModalRecord): Element[] => {
    const content = resolveContent(record);
    return [content, ...record.branches].filter((element): element is Element => !!element);
  };

  const restoreIsolationElement = (element: Element, snapshot: IsolationSnapshot) => {
    if (snapshot.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', snapshot.ariaHidden);
    (element as HTMLElement & { inert: boolean }).inert = snapshot.inert;
    if (!snapshot.hadInertAttribute) element.removeAttribute('inert');
    (element as HTMLElement).style.pointerEvents = snapshot.pointerEvents;
  };

  const restoreIsolation = () => {
    for (const [element, snapshot] of isolation) restoreIsolationElement(element, snapshot);
    isolation.clear();
  };

  const applyIsolation = (record: ModalRecord) => {
    restoreIsolation();
    if (record.options.isolate === false) return;
    const protectedElements = activeProtected(record);
    const container = isolationContainer(scope.root, scope.document);
    for (const child of Array.from(container.children)) {
      if (isProtected(child, protectedElements)) continue;
      const html = child as HTMLElement;
      isolation.set(child, {
        ariaHidden: child.getAttribute('aria-hidden'),
        hadInertAttribute: child.hasAttribute('inert'),
        inert: (html as HTMLElement & { inert: boolean }).inert ?? false,
        pointerEvents: html.style.pointerEvents,
      });
      child.setAttribute('aria-hidden', 'true');
      (html as HTMLElement & { inert: boolean }).inert = true;
      if (record.options.disableOutsidePointerEvents !== false) html.style.pointerEvents = 'none';
    }
  };

  const unlockScroll = () => {
    const snapshot = scrollSnapshot;
    if (!snapshot) return;
    snapshot.releaseTouch();
    snapshot.releaseViewport();
    Object.assign(snapshot.target.style, {
      overflow: snapshot.overflow,
      paddingRight: snapshot.paddingRight,
      position: snapshot.position,
      top: snapshot.top,
      left: snapshot.left,
      right: snapshot.right,
      width: snapshot.width,
      touchAction: snapshot.touchAction,
      scrollbarGutter: snapshot.scrollbarGutter,
    });
    scrollSnapshot = null;
    if (snapshot.restoreScrollPosition) {
      scope.window.scrollTo(snapshot.scrollX, snapshot.scrollY);
    }
  };

  const lockScroll = (record: ModalRecord) => {
    if (scrollSnapshot || record.options.lockScroll === false) return;
    const target = record.options.scrollTarget ?? scope.document.body;
    const style = target.style;
    const scrollX = scope.window.scrollX;
    const scrollY = scope.window.scrollY;
    const scrollbarWidth = Math.max(0, scope.window.innerWidth - scope.document.documentElement.clientWidth);
    const previousPadding = Number.parseFloat(scope.window.getComputedStyle(target).paddingRight) || 0;
    let releaseTouch: () => void = () => undefined;
    let releaseViewport: () => void = () => undefined;
    const iosScrollLock = isIOS(scope.window);
    const snapshot: ScrollSnapshot = {
      target,
      overflow: style.overflow,
      paddingRight: style.paddingRight,
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      touchAction: style.touchAction,
      scrollbarGutter: style.scrollbarGutter,
      scrollX,
      scrollY,
      restoreScrollPosition: iosScrollLock,
      get releaseTouch() {
        return releaseTouch;
      },
      get releaseViewport() {
        return releaseViewport;
      },
    };
    scrollSnapshot = snapshot;
    style.overflow = 'hidden';
    if (scrollbarWidth > 0) style.paddingRight = `${previousPadding + scrollbarWidth}px`;
    style.scrollbarGutter = 'stable';
    if (iosScrollLock) {
      style.position = 'fixed';
      style.top = `${-scrollY}px`;
      style.left = `${-scrollX}px`;
      style.right = '0';
      style.width = '100%';
      if (!record.options.allowPinchZoom) style.touchAction = 'none';
      const onTouchMove = (event: TouchEvent) => {
        const current = top();
        if (!current) return;
        if (current.options.allowPinchZoom && event.touches.length > 1) return;
        if (!touchCanScroll(scope, event, activeProtected(current))) event.preventDefault();
      };
      scope.document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      releaseTouch = scope.track('listener', () => {
        scope.document.removeEventListener('touchmove', onTouchMove, true);
      }, 'modal-ios-touchmove');
      const viewport = scope.window.visualViewport;
      if (viewport) {
        const syncViewport = () => {
          if (!scrollSnapshot) return;
          target.style.top = `${-(scrollSnapshot.scrollY - viewport.offsetTop)}px`;
          target.style.left = `${-(scrollSnapshot.scrollX - viewport.offsetLeft)}px`;
        };
        viewport.addEventListener('resize', syncViewport);
        viewport.addEventListener('scroll', syncViewport);
        releaseViewport = scope.track('listener', () => {
          viewport.removeEventListener('resize', syncViewport);
          viewport.removeEventListener('scroll', syncViewport);
        }, 'modal-visual-viewport');
      }
    }
  };

  const recompute = () => {
    const record = top();
    if (!record) {
      restoreIsolation();
      unlockScroll();
      return;
    }
    applyIsolation(record);
    const anyScrollLock = [...records].some((entry) => !entry.destroyed && entry.options.lockScroll !== false);
    if (anyScrollLock) lockScroll(record);
    else unlockScroll();
    scope.environment.trace({
      kind: 'dom-modal',
      operation: 'recompute',
      timestamp: scope.environment.now(),
      details: { modalId: record.id, depth: records.length, isolated: isolation.size },
    });
  };

  return {
    get size() {
      return records.filter((record) => !record.destroyed).length;
    },
    get topModalId() {
      return top()?.id ?? null;
    },
    acquire(options) {
      assertManagerAlive('acquire modal');
      sequence += 1;
      const id = options.id ?? `modal-${sequence}`;
      const record: ModalRecord = {
        id,
        options,
        branches: new Set(options.branches ?? []),
        releaseResource: scope.track('modalLock', () => undefined, id),
        destroyed: false,
      };
      records.push(record);
      recompute();
      return {
        id,
        get topmost() {
          return top() === record;
        },
        addBranch(element) {
          assertManagerAlive('add modal branch', record);
          record.branches.add(element);
          recompute();
          return once(() => {
            record.branches.delete(element);
            recompute();
          });
        },
        update(next) {
          assertManagerAlive('update modal', record);
          record.options = { ...record.options, ...next };
          recompute();
        },
        destroy() {
          if (record.destroyed) return;
          record.destroyed = true;
          record.branches.clear();
          const index = records.indexOf(record);
          if (index >= 0) records.splice(index, 1);
          record.releaseResource();
          recompute();
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const record of records) {
        record.destroyed = true;
        record.releaseResource();
      }
      records.length = 0;
      restoreIsolation();
      unlockScroll();
    },
  };
}
