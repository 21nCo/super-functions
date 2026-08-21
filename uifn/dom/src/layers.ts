import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomScope } from './scope';

export type UIFnDismissReason = 'pointer-outside' | 'focus-outside' | 'escape';

export interface UIFnOutsideInteraction {
  readonly type: 'pointerdownOutside' | 'focusOutside' | 'interactOutside' | 'escapeKeyDown';
  readonly originalEvent: Event;
  readonly pointerType?: string;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface UIFnDismissableLayerOptions {
  readonly id?: string;
  readonly element: HTMLElement | (() => HTMLElement | null);
  readonly enabled?: boolean;
  readonly dismissOnPointerOutside?: boolean;
  readonly dismissOnFocusOutside?: boolean;
  readonly dismissOnEscape?: boolean;
  readonly dismissOnRightClick?: boolean;
  readonly onPointerDownOutside?: (event: UIFnOutsideInteraction) => void;
  readonly onFocusOutside?: (event: UIFnOutsideInteraction) => void;
  readonly onInteractOutside?: (event: UIFnOutsideInteraction) => void;
  readonly onEscapeKeyDown?: (event: UIFnOutsideInteraction) => void;
  readonly onDismiss?: (reason: UIFnDismissReason, event: Event) => void;
}

export interface UIFnDismissableLayerHandle {
  readonly id: string;
  readonly topmost: boolean;
  addBranch(element: Element): () => void;
  update(options: Partial<Omit<UIFnDismissableLayerOptions, 'id'>>): void;
  bringToFront(): void;
  destroy(): void;
}

export interface UIFnDismissableLayerStack {
  readonly size: number;
  readonly topLayerId: string | null;
  register(options: UIFnDismissableLayerOptions): UIFnDismissableLayerHandle;
  destroy(): void;
}

interface LayerRecord {
  readonly id: string;
  options: UIFnDismissableLayerOptions;
  readonly branches: Set<Element>;
  readonly releaseResource: () => void;
  destroyed: boolean;
}

interface PendingTouch {
  readonly layerId: string;
  readonly originalEvent: PointerEvent;
}

function once(callback: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    callback();
  };
}

function resolveElement(layer: LayerRecord): HTMLElement | null {
  return typeof layer.options.element === 'function'
    ? layer.options.element()
    : layer.options.element;
}

function eventPath(event: Event): readonly EventTarget[] {
  const path = event.composedPath();
  return path.length > 0 ? path : event.target ? [event.target] : [];
}

function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && (value as Node).nodeType === 1;
}

function isPointerEvent(value: Event): value is PointerEvent {
  return 'pointerId' in value && 'pointerType' in value;
}

function pathIsInside(scope: UIFnDomScope, layer: LayerRecord, event: Event): boolean {
  const path = eventPath(event);
  const element = resolveElement(layer);
  if (element && path.includes(element)) return true;
  for (const branch of layer.branches) {
    if (path.includes(branch)) return true;
  }
  if (isPointerEvent(event) && event.pointerId >= 0) {
    const target = event.target;
    if (isElement(target) && target.hasPointerCapture?.(event.pointerId)) {
      return !!element?.contains(target) || [...layer.branches].some((branch) => branch.contains(target));
    }
  }
  return false;
}

function isScrollbarInteraction(scope: UIFnDomScope, event: PointerEvent): boolean {
  const target = event.target;
  if (target !== scope.document.documentElement && target !== scope.document.body) return false;
  const root = scope.document.documentElement;
  if (root.clientWidth <= 0 || root.clientHeight <= 0) return false;
  return event.clientX >= root.clientWidth || event.clientY >= root.clientHeight;
}

function createOutsideEvent(
  scope: UIFnDomScope,
  type: UIFnOutsideInteraction['type'],
  originalEvent: Event,
): UIFnOutsideInteraction {
  let prevented = false;
  return {
    type,
    originalEvent,
    pointerType: isPointerEvent(originalEvent) ? originalEvent.pointerType : undefined,
    get defaultPrevented() {
      return prevented || originalEvent.defaultPrevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

export function createUIFnDismissableLayerStack(scope: UIFnDomScope): UIFnDismissableLayerStack {
  scope.assertAlive('create dismissable layer stack');
  const layers: LayerRecord[] = [];
  let layerSequence = 0;
  let destroyed = false;
  let pendingTouch: PendingTouch | null = null;

  const assertStackAlive = (operation: string, layer?: LayerRecord) => {
    scope.assertAlive(operation);
    if (!destroyed && !layer?.destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'DismissableLayer',
      message: `Cannot ${operation} after the layer service is destroyed.`,
    });
  };

  const topLayer = (interaction?: 'pointer' | 'focus' | 'escape') => {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      if (layer.destroyed || layer.options.enabled === false) continue;
      if (
        interaction === 'pointer'
        && layer.options.dismissOnPointerOutside === false
        && !layer.options.onPointerDownOutside
        && !layer.options.onInteractOutside
      ) continue;
      if (
        interaction === 'focus'
        && layer.options.dismissOnFocusOutside === false
        && !layer.options.onFocusOutside
        && !layer.options.onInteractOutside
      ) continue;
      if (
        interaction === 'escape'
        && layer.options.dismissOnEscape === false
        && !layer.options.onEscapeKeyDown
      ) continue;
      return layer;
    }
    return null;
  };

  const trace = (operation: string, layer: LayerRecord, details?: Record<string, unknown>) => {
    scope.environment.trace({
      kind: 'dom-layer',
      operation,
      timestamp: scope.environment.now(),
      details: { layerId: layer.id, ...details },
    });
  };

  const dismissPointer = (layer: LayerRecord, event: PointerEvent) => {
    if (pathIsInside(scope, layer, event) || isScrollbarInteraction(scope, event)) return;
    const outside = createOutsideEvent(scope, 'pointerdownOutside', event);
    layer.options.onPointerDownOutside?.(outside);
    const interact = createOutsideEvent(scope, 'interactOutside', event);
    if (outside.defaultPrevented) interact.preventDefault();
    layer.options.onInteractOutside?.(interact);
    trace('pointer-outside', layer, {
      pointerType: event.pointerType || 'mouse',
      canceled: outside.defaultPrevented || interact.defaultPrevented,
    });
    if (
      layer.options.dismissOnPointerOutside !== false
      && !outside.defaultPrevented
      && !interact.defaultPrevented
    ) {
      layer.options.onDismiss?.('pointer-outside', event);
    }
  };

  const onPointerDown = (rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      const layer = topLayer('pointer');
      if (!layer) return;
      const rightClick = event.button === 2 || (event.button === 0 && event.ctrlKey);
      if (rightClick && layer.options.dismissOnRightClick !== true) return;
      if (event.pointerType === 'touch') {
        pendingTouch = pathIsInside(scope, layer, event) ? null : { layerId: layer.id, originalEvent: event };
        return;
      }
      dismissPointer(layer, event);
  };
  const onPointerUp = (rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      const pending = pendingTouch;
      pendingTouch = null;
      const layer = topLayer('pointer');
      if (!pending || pending.layerId !== layer?.id) return;
      dismissPointer(layer, event);
  };
  const onPointerCancel = () => {
      pendingTouch = null;
  };
  const releases = [
    scope.on('pointerdown', onPointerDown, true),
    scope.on('pointerup', onPointerUp, true),
    scope.on('pointercancel', onPointerCancel, true),
    scope.on('focusin', (event) => {
      const layer = topLayer('focus');
      if (!layer || pathIsInside(scope, layer, event)) return;
      const outside = createOutsideEvent(scope, 'focusOutside', event);
      layer.options.onFocusOutside?.(outside);
      const interact = createOutsideEvent(scope, 'interactOutside', event);
      if (outside.defaultPrevented) interact.preventDefault();
      layer.options.onInteractOutside?.(interact);
      trace('focus-outside', layer, {
        canceled: outside.defaultPrevented || interact.defaultPrevented,
      });
      if (
        layer.options.dismissOnFocusOutside !== false
        && !outside.defaultPrevented
        && !interact.defaultPrevented
      ) {
        layer.options.onDismiss?.('focus-outside', event);
      }
    }, true),
    scope.on('keydown', (rawEvent) => {
      const event = rawEvent as KeyboardEvent;
      if (event.key !== 'Escape' || event.isComposing) return;
      const layer = topLayer('escape');
      if (!layer) return;
      const escape = createOutsideEvent(scope, 'escapeKeyDown', event);
      layer.options.onEscapeKeyDown?.(escape);
      trace('escape', layer, { canceled: escape.defaultPrevented });
      if (layer.options.dismissOnEscape !== false && !escape.defaultPrevented) {
        layer.options.onDismiss?.('escape', event);
      }
    }, true),
  ];
  if (typeof (scope.window as Window & { PointerEvent?: unknown }).PointerEvent !== 'function') {
    releases.push(
      scope.on('mousedown', onPointerDown, true),
      scope.on('touchstart', (event) => {
        const layer = topLayer('pointer');
        if (layer && !pathIsInside(scope, layer, event)) {
          pendingTouch = { layerId: layer.id, originalEvent: event as unknown as PointerEvent };
        }
      }, { capture: true, passive: true }),
      scope.on('touchend', (event) => {
        const pending = pendingTouch;
        pendingTouch = null;
        const layer = topLayer('pointer');
        if (pending && pending.layerId === layer?.id) dismissPointer(layer, event as unknown as PointerEvent);
      }, true),
      scope.on('touchcancel', onPointerCancel, true),
    );
  }

  return {
    get size() {
      return layers.filter((layer) => !layer.destroyed).length;
    },
    get topLayerId() {
      return topLayer()?.id ?? null;
    },
    register(options) {
      assertStackAlive('register dismissable layer');
      layerSequence += 1;
      const id = options.id ?? `layer-${layerSequence}`;
      const releaseResource = scope.track('layer', () => undefined, id);
      const layer: LayerRecord = {
        id,
        options,
        branches: new Set(),
        releaseResource,
        destroyed: false,
      };
      layers.push(layer);
      trace('register', layer);
      return {
        id,
        get topmost() {
          return topLayer() === layer;
        },
        addBranch(element) {
          assertStackAlive('register dismissable branch', layer);
          layer.branches.add(element);
          trace('branch-register', layer, { branchCount: layer.branches.size });
          return once(() => {
            layer.branches.delete(element);
            trace('branch-remove', layer, { branchCount: layer.branches.size });
          });
        },
        update(next) {
          assertStackAlive('update dismissable layer', layer);
          layer.options = { ...layer.options, ...next };
          trace('update', layer);
        },
        bringToFront() {
          assertStackAlive('reorder dismissable layer', layer);
          const index = layers.indexOf(layer);
          if (index < 0 || index === layers.length - 1) return;
          layers.splice(index, 1);
          layers.push(layer);
          trace('bring-to-front', layer);
        },
        destroy() {
          if (layer.destroyed) return;
          layer.destroyed = true;
          layer.branches.clear();
          const index = layers.indexOf(layer);
          if (index >= 0) layers.splice(index, 1);
          if (pendingTouch?.layerId === id) pendingTouch = null;
          releaseResource();
          trace('destroy', layer);
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pendingTouch = null;
      for (const layer of [...layers]) {
        layer.destroyed = true;
        layer.branches.clear();
        layer.releaseResource();
      }
      layers.length = 0;
      releases.forEach((release) => release());
    },
  };
}
