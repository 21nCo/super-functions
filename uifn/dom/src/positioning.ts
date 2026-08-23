import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  hide,
  inline,
  offset,
  shift,
  size,
  type Middleware,
  type Placement,
  type ReferenceElement,
  type Strategy,
} from '@floating-ui/dom';
import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomScope } from './scope';

export type UIFnPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end';

export type UIFnPositionStrategy = 'absolute' | 'fixed';

export interface UIFnVirtualAnchor {
  getBoundingClientRect(): DOMRect | DOMRectReadOnly;
  getClientRects?(): ArrayLike<DOMRect | DOMRectReadOnly>;
  readonly contextElement?: Element;
}

export function createUIFnPointAnchor(
  x: number,
  y: number,
  contextElement?: Element,
): UIFnVirtualAnchor {
  return Object.freeze({
    contextElement,
    getBoundingClientRect() {
      return Object.freeze({
        x,
        y,
        top: y,
        right: x,
        bottom: y,
        left: x,
        width: 0,
        height: 0,
        toJSON() {
          return { x, y, top: y, right: x, bottom: y, left: x, width: 0, height: 0 };
        },
      }) as DOMRectReadOnly;
    },
  });
}

export interface UIFnPositionMiddlewareData {
  readonly arrow?: { readonly x?: number; readonly y?: number; readonly centerOffset?: number };
  readonly availableWidth?: number;
  readonly availableHeight?: number;
  readonly referenceHidden: boolean;
  readonly escaped: boolean;
}

export interface UIFnPositionResult {
  readonly x: number;
  readonly y: number;
  readonly placement: UIFnPlacement;
  readonly strategy: UIFnPositionStrategy;
  readonly middleware: Readonly<UIFnPositionMiddlewareData>;
  readonly cssVariables: Readonly<Record<string, string>>;
}

export interface UIFnPositionerOptions {
  readonly reference: Element | UIFnVirtualAnchor | (() => Element | UIFnVirtualAnchor | null);
  readonly floating: HTMLElement | (() => HTMLElement | null);
  readonly arrow?: HTMLElement | (() => HTMLElement | null) | null;
  readonly placement?: UIFnPlacement;
  readonly strategy?: UIFnPositionStrategy;
  readonly sideOffset?: number;
  readonly alignOffset?: number;
  readonly collisionPadding?: number;
  readonly boundary?: Element | readonly Element[] | 'clippingAncestors';
  readonly flip?: boolean;
  readonly shift?: boolean;
  readonly sticky?: 'partial' | 'always';
  readonly hideWhenDetached?: boolean;
  readonly inline?: boolean;
  readonly autoUpdate?: boolean;
  readonly animationFrame?: boolean;
  readonly applyStyles?: boolean;
  readonly onUpdate?: (result: Readonly<UIFnPositionResult>) => void;
}

export interface UIFnPositioner {
  readonly running: boolean;
  readonly destroyed: boolean;
  readonly result: Readonly<UIFnPositionResult> | null;
  start(): void;
  stop(): void;
  update(options?: Partial<UIFnPositionerOptions>): Promise<Readonly<UIFnPositionResult>>;
  subscribe(callback: (result: Readonly<UIFnPositionResult>) => void): () => void;
  destroy(): void;
}

function resolve<T>(value: T | (() => T | null) | null | undefined): T | null {
  return typeof value === 'function' ? (value as () => T | null)() : value ?? null;
}

function numberCss(value: number | undefined): string {
  return `${Number.isFinite(value) ? value : 0}px`;
}

function publicResult(
  raw: Awaited<ReturnType<typeof computePosition>>,
  reference: Element | UIFnVirtualAnchor,
  sizeData: { availableWidth?: number; availableHeight?: number },
): Readonly<UIFnPositionResult> {
  const referenceRect = reference.getBoundingClientRect();
  const arrowData = raw.middlewareData.arrow;
  const referenceHideData = raw.middlewareData.referenceHide;
  const escapedHideData = raw.middlewareData.escapedHide;
  const middleware = Object.freeze({
    arrow: arrowData
      ? Object.freeze({ x: arrowData.x, y: arrowData.y, centerOffset: arrowData.centerOffset })
      : undefined,
    availableWidth: sizeData.availableWidth,
    availableHeight: sizeData.availableHeight,
    referenceHidden: referenceHideData?.referenceHidden ?? false,
    escaped: escapedHideData?.escaped ?? false,
  });
  const cssVariables = Object.freeze({
    '--uifn-position-x': numberCss(raw.x),
    '--uifn-position-y': numberCss(raw.y),
    '--uifn-position-available-width': numberCss(sizeData.availableWidth),
    '--uifn-position-available-height': numberCss(sizeData.availableHeight),
    '--uifn-position-anchor-width': numberCss(referenceRect.width),
    '--uifn-position-anchor-height': numberCss(referenceRect.height),
    '--uifn-position-arrow-x': numberCss(arrowData?.x),
    '--uifn-position-arrow-y': numberCss(arrowData?.y),
  });
  return Object.freeze({
    x: raw.x,
    y: raw.y,
    placement: raw.placement as UIFnPlacement,
    strategy: raw.strategy as UIFnPositionStrategy,
    middleware,
    cssVariables,
  });
}

function applyPosition(
  floating: HTMLElement,
  arrowElement: HTMLElement | null,
  result: Readonly<UIFnPositionResult>,
): void {
  Object.assign(floating.style, {
    position: result.strategy,
    left: `${result.x}px`,
    top: `${result.y}px`,
  });
  for (const [name, value] of Object.entries(result.cssVariables)) {
    floating.style.setProperty(name, value);
  }
  floating.dataset.side = result.placement.split('-')[0];
  floating.dataset.align = result.placement.split('-')[1] ?? 'center';
  floating.dataset.referenceHidden = String(result.middleware.referenceHidden);
  floating.dataset.escaped = String(result.middleware.escaped);
  floating.dataset.uifnPositioned = 'true';
  if (arrowElement && result.middleware.arrow) {
    arrowElement.style.left = result.middleware.arrow.x === undefined
      ? ''
      : `${result.middleware.arrow.x}px`;
    arrowElement.style.top = result.middleware.arrow.y === undefined
      ? ''
      : `${result.middleware.arrow.y}px`;
  }
}

export function createUIFnPositioner(
  scope: UIFnDomScope,
  initialOptions: UIFnPositionerOptions,
): UIFnPositioner {
  scope.assertAlive('create positioner');
  let options = initialOptions;
  let running = false;
  let destroyed = false;
  let result: Readonly<UIFnPositionResult> | null = null;
  let cleanupAutoUpdate: () => void = () => undefined;
  let boundReference: ReferenceElement | null = null;
  let boundFloating: HTMLElement | null = null;
  let generation = 0;
  const subscribers = new Set<(result: Readonly<UIFnPositionResult>) => void>();
  const releaseResource = scope.track('positioner', () => undefined);

  const assertPositionerAlive = (operation: string) => {
    scope.assertAlive(operation);
    if (!destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'Positioner',
      message: `Cannot ${operation} after the positioner is destroyed.`,
    });
  };

  const update = async (
    nextOptions?: Partial<UIFnPositionerOptions>,
  ): Promise<Readonly<UIFnPositionResult>> => {
    assertPositionerAlive('update position');
    const autoUpdateConfigChanged = !!nextOptions && (
      ('autoUpdate' in nextOptions && nextOptions.autoUpdate !== options.autoUpdate)
      || ('animationFrame' in nextOptions && nextOptions.animationFrame !== options.animationFrame)
    );
    if (nextOptions) options = { ...options, ...nextOptions };
    const reference = resolve(options.reference);
    const floating = resolve(options.floating);
    const arrowElement = resolve(options.arrow);
    if (!reference || !floating) {
      throw createUIFnError({
        code: 'UIFN_DOM_SCOPE_INVALID',
        package: '@uifn/dom',
        component: 'Positioner',
        message: 'Positioning requires connected reference and floating elements.',
        recoverable: true,
        details: { hasReference: !!reference, hasFloating: !!floating },
      });
    }
    const restartAutoUpdate = running && (
      autoUpdateConfigChanged
      || reference !== boundReference
      || floating !== boundFloating
    );
    if (restartAutoUpdate) {
      cleanupAutoUpdate();
      cleanupAutoUpdate = () => undefined;
      running = false;
      if (options.autoUpdate !== false) {
        running = true;
        boundReference = reference as ReferenceElement;
        boundFloating = floating;
        cleanupAutoUpdate = scope.track('observer', autoUpdate(
          reference as ReferenceElement,
          floating,
          () => void update().catch((error) => scope.environment.error(error)),
          { animationFrame: options.animationFrame ?? false },
        ), 'position-auto-update');
      }
    }
    const currentGeneration = ++generation;
    const sizeData: { availableWidth?: number; availableHeight?: number } = {};
    const hasCollisionGeometry = scope.document.documentElement.clientWidth > 0
      && scope.document.documentElement.clientHeight > 0;
    const configuredBoundary = options.boundary;
    let boundary: Element | Element[] | 'clippingAncestors';
    if (configuredBoundary === undefined || configuredBoundary === 'clippingAncestors') {
      boundary = 'clippingAncestors';
    } else if ('nodeType' in configuredBoundary) {
      boundary = configuredBoundary;
    } else {
      boundary = Array.from(configuredBoundary);
    }
    const overflowOptions = {
      padding: options.collisionPadding ?? 8,
      boundary,
    } as const;
    const referenceHide = hide({ ...overflowOptions, strategy: 'referenceHidden' });
    const escapedHide = hide({ ...overflowOptions, strategy: 'escaped' });
    const middleware: Array<Middleware | null | false | undefined> = [
      options.inline ? inline() : null,
      offset({ mainAxis: options.sideOffset ?? 0, crossAxis: options.alignOffset ?? 0 }),
      options.flip === false || !hasCollisionGeometry ? null : flip(overflowOptions),
      options.shift === false || !hasCollisionGeometry
        ? null
        : shift({ ...overflowOptions, crossAxis: options.sticky === 'always' }),
      hasCollisionGeometry ? size({
        ...overflowOptions,
        apply({ availableWidth, availableHeight }) {
          sizeData.availableWidth = availableWidth;
          sizeData.availableHeight = availableHeight;
        },
      }) : null,
      arrowElement ? arrow({ element: arrowElement, padding: options.collisionPadding ?? 4 }) : null,
      options.hideWhenDetached === false || !hasCollisionGeometry
        ? null
        : { ...referenceHide, name: 'referenceHide' },
      options.hideWhenDetached === false || !hasCollisionGeometry
        ? null
        : { ...escapedHide, name: 'escapedHide' },
    ];
    const raw = await computePosition(
      reference as ReferenceElement,
      floating,
      {
        placement: (options.placement ?? 'bottom') as Placement,
        strategy: (options.strategy ?? 'absolute') as Strategy,
        middleware,
      },
    );
    if (destroyed || currentGeneration !== generation) {
      if (result) return result;
      throw createUIFnError({
        code: 'UIFN_DOM_SERVICE_DESTROYED',
        package: '@uifn/dom',
        component: 'Positioner',
        message: 'The position result became stale before publication.',
        recoverable: true,
      });
    }
    if (![raw.x, raw.y].every(Number.isFinite)) {
      throw createUIFnError({
        code: 'UIFN_POSITION_OUT_OF_BOUNDARY',
        package: '@uifn/dom',
        component: 'Positioner',
        message: 'Positioning produced non-finite coordinates.',
        details: { placement: raw.placement },
      });
    }
    result = publicResult(raw, reference, sizeData);
    if (options.applyStyles !== false) applyPosition(floating, arrowElement, result);
    options.onUpdate?.(result);
    subscribers.forEach((subscriber) => subscriber(result!));
    scope.environment.trace({
      kind: 'dom-position',
      operation: 'update',
      timestamp: scope.environment.now(),
      details: {
        placement: result.placement,
        strategy: result.strategy,
        referenceHidden: result.middleware.referenceHidden,
        escaped: result.middleware.escaped,
      },
    });
    return result;
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cleanupAutoUpdate();
    cleanupAutoUpdate = () => undefined;
    boundReference = null;
    boundFloating = null;
  };

  return {
    get running() {
      return running;
    },
    get destroyed() {
      return destroyed;
    },
    get result() {
      return result;
    },
    start() {
      assertPositionerAlive('start positioner');
      if (running) return;
      const reference = resolve(options.reference);
      const floating = resolve(options.floating);
      if (!reference || !floating) {
        void update().catch((error) => scope.environment.error(error));
      } else if (options.autoUpdate === false) {
        void update().catch((error) => scope.environment.error(error));
      }
      else {
        running = true;
        boundReference = reference as ReferenceElement;
        boundFloating = floating;
        const dependencyCleanup = autoUpdate(
          reference as ReferenceElement,
          floating,
          () => void update().catch((error) => scope.environment.error(error)),
          { animationFrame: options.animationFrame ?? false },
        );
        const release = scope.track('observer', dependencyCleanup, 'position-auto-update');
        cleanupAutoUpdate = release;
      }
    },
    stop,
    update,
    subscribe(callback) {
      assertPositionerAlive('subscribe to positioner');
      subscribers.add(callback);
      if (result) callback(result);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(callback);
      };
    },
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      generation += 1;
      subscribers.clear();
      releaseResource();
    },
  };
}
