import {
  focusable as collectFocusable,
  isFocusable as dependencyIsFocusable,
  isTabbable as dependencyIsTabbable,
  tabbable as collectTabbable,
  type FocusableElement,
} from 'tabbable';
import type { UIFnDomRoot, UIFnDomScope } from './scope';

export interface UIFnFocusableOptions {
  readonly includeContainer?: boolean;
  readonly includeIframes?: boolean;
  readonly displayCheck?: 'full' | 'legacy-full' | 'non-zero-area' | 'none';
  readonly getShadowRoot?: (node: Element) => ShadowRoot | boolean | null | undefined;
}

function containerFor(root: UIFnDomRoot): Element {
  if (root.nodeType === 9) return (root as Document).body ?? (root as Document).documentElement;
  return root as Element;
}

function dependencyOptions(options: UIFnFocusableOptions) {
  return {
    includeContainer: options.includeContainer ?? false,
    displayCheck: options.displayCheck ?? 'full',
    getShadowRoot: (node: FocusableElement) =>
      options.getShadowRoot?.(node) ?? node.shadowRoot ?? false,
  } as const;
}

function withIframeDescendants(
  candidates: FocusableElement[],
  options: UIFnFocusableOptions,
  collect: (container: Element, options: ReturnType<typeof dependencyOptions>) => FocusableElement[],
): HTMLElement[] {
  if (options.includeIframes === false) return candidates as HTMLElement[];
  const result: HTMLElement[] = [];
  for (const candidate of candidates) {
    result.push(candidate as HTMLElement);
    if (candidate.localName !== 'iframe') continue;
    try {
      const document = (candidate as HTMLIFrameElement).contentDocument;
      if (!document?.body) continue;
      result.push(...collect(document.body, dependencyOptions(options)) as HTMLElement[]);
    } catch {
      // Cross-origin frames are opaque and the iframe itself remains the focus boundary.
    }
  }
  return result;
}

export function getUIFnTabbable(
  root: UIFnDomRoot,
  options: UIFnFocusableOptions = {},
): HTMLElement[] {
  const candidates = collectTabbable(containerFor(root), dependencyOptions(options));
  return withIframeDescendants(candidates, options, collectTabbable);
}

export function getUIFnFocusable(
  root: UIFnDomRoot,
  options: UIFnFocusableOptions = {},
): HTMLElement[] {
  const candidates = collectFocusable(containerFor(root), dependencyOptions(options));
  return withIframeDescendants(candidates, options, collectFocusable);
}

export function isUIFnTabbable(
  element: Element,
  options: UIFnFocusableOptions = {},
): boolean {
  return dependencyIsTabbable(element, dependencyOptions(options));
}

export function isUIFnFocusable(
  element: Element,
  options: UIFnFocusableOptions = {},
): boolean {
  return dependencyIsFocusable(element, dependencyOptions(options));
}

export function focusUIFnElement(element: Element | null | undefined, preventScroll = true): boolean {
  if (!element || !('focus' in element) || typeof element.focus !== 'function') return false;
  if (!element.isConnected) return false;
  const document = element.ownerDocument;
  const layoutless = document.documentElement.getClientRects().length === 0;
  if (!isUIFnFocusable(element, { displayCheck: layoutless ? 'none' : 'full' })) return false;
  (element as HTMLElement).focus({ preventScroll });
  return true;
}

export type UIFnInputModality = 'keyboard' | 'pointer' | 'touch' | 'virtual';

export interface UIFnInputModalityService {
  readonly modality: UIFnInputModality;
  readonly focusVisible: boolean;
  isFocusVisible(element?: Element | null): boolean;
  setVirtual(): void;
  subscribe(callback: (modality: UIFnInputModality) => void): () => void;
  destroy(): void;
}

export function createUIFnInputModality(scope: UIFnDomScope): UIFnInputModalityService {
  scope.assertAlive('create input modality service');
  let destroyed = false;
  let modality: UIFnInputModality = 'virtual';
  let focusVisible = true;
  const subscribers = new Set<(modality: UIFnInputModality) => void>();
  const publish = (next: UIFnInputModality) => {
    if (destroyed || next === modality) return;
    modality = next;
    focusVisible = next === 'keyboard' || next === 'virtual';
    subscribers.forEach((subscriber) => subscriber(next));
  };
  const releases = [
    scope.on('keydown', (event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.metaKey || keyboard.altKey || keyboard.ctrlKey) return;
      publish('keyboard');
    }, true),
    scope.on('pointerdown', (event) => {
      const pointer = event as PointerEvent;
      publish(pointer.pointerType === 'touch' ? 'touch' : 'pointer');
    }, true),
    scope.on('touchstart', () => publish('touch'), { capture: true, passive: true }),
  ];
  const releaseResource = scope.track('modality', () => undefined);
  return {
    get modality() {
      return modality;
    },
    get focusVisible() {
      return focusVisible;
    },
    isFocusVisible(element) {
      if (!element) return focusVisible;
      return focusVisible || element.matches(':focus-visible');
    },
    setVirtual() {
      publish('virtual');
    },
    subscribe(callback) {
      scope.assertAlive('subscribe to input modality');
      subscribers.add(callback);
      callback(modality);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(callback);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releases.forEach((release) => release());
      releaseResource();
      subscribers.clear();
    },
  };
}
