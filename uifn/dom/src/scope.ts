import {
  createUIFnEnvironment,
  type UIFnEnvironment,
  type UIFnResolvedEnvironment,
  type UIFnScheduler,
} from '@uifn/core/environment';
import { createUIFnError } from '@uifn/core/errors';

export type UIFnDomRoot = Document | ShadowRoot | HTMLElement;
export type UIFnDomResourceKind =
  | 'listener'
  | 'observer'
  | 'timer'
  | 'animationFrame'
  | 'layer'
  | 'focusScope'
  | 'modalLock'
  | 'positioner'
  | 'portal'
  | 'presence'
  | 'formBridge'
  | 'liveRegion'
  | 'modality';

export interface UIFnDomResourceSnapshot {
  readonly listener: number;
  readonly observer: number;
  readonly timer: number;
  readonly animationFrame: number;
  readonly layer: number;
  readonly focusScope: number;
  readonly modalLock: number;
  readonly positioner: number;
  readonly portal: number;
  readonly presence: number;
  readonly formBridge: number;
  readonly liveRegion: number;
  readonly modality: number;
  readonly total: number;
}

export interface UIFnDomTraceRecord {
  readonly sequence: number;
  readonly service: string;
  readonly operation: string;
  readonly resourceId?: string;
  readonly timestamp: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type UIFnDomEventListener = (event: Event) => void;

export interface UIFnDomScope {
  readonly environment: UIFnResolvedEnvironment;
  readonly root: UIFnDomRoot;
  readonly document: Document;
  readonly window: Window;
  readonly destroyed: boolean;
  getActiveElement(): Element | null;
  query<T extends Element = Element>(selector: string): T | null;
  queryAll<T extends Element = Element>(selector: string): T[];
  on(
    type: string,
    listener: UIFnDomEventListener,
    options?: AddEventListenerOptions | boolean,
  ): () => void;
  track(kind: UIFnDomResourceKind, cleanup?: () => void, id?: string): () => void;
  setTimeout(callback: () => void, delayMs: number): () => void;
  requestAnimationFrame(callback: (timestamp: number) => void): () => void;
  observeResize(target: Element, callback: ResizeObserverCallback, optional?: boolean): () => void;
  observeIntersection(
    target: Element,
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
    optional?: boolean,
  ): () => void;
  observeMutation(
    target: Node,
    callback: MutationCallback,
    options: MutationObserverInit,
    optional?: boolean,
  ): () => void;
  resources(): Readonly<UIFnDomResourceSnapshot>;
  trace(): readonly Readonly<UIFnDomTraceRecord>[];
  assertAlive(operation: string): void;
  destroy(): void;
}

export interface CreateUIFnDomScopeOptions {
  readonly root?: UIFnDomRoot | null;
  readonly environment?: UIFnEnvironment;
  readonly traceLimit?: number;
}

interface DelegatedListener {
  readonly type: string;
  readonly capture: boolean;
  readonly passive: boolean;
  readonly once: boolean;
  readonly callbacks: Set<UIFnDomEventListener>;
  readonly nativeListener: EventListener;
}

const RESOURCE_KINDS: readonly UIFnDomResourceKind[] = [
  'listener',
  'observer',
  'timer',
  'animationFrame',
  'layer',
  'focusScope',
  'modalLock',
  'positioner',
  'portal',
  'presence',
  'formBridge',
  'liveRegion',
  'modality',
];

function once(callback: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    callback();
  };
}

function isDocument(value: unknown): value is Document {
  return !!value && typeof value === 'object' && (value as Node).nodeType === 9;
}

function isShadowRoot(value: unknown): value is ShadowRoot {
  return !!value
    && typeof value === 'object'
    && (value as Node).nodeType === 11
    && 'host' in value;
}

function ownerDocumentFor(root: UIFnDomRoot): Document | null {
  if (isDocument(root)) return root;
  return root.ownerDocument ?? null;
}

function activeElementDeep(root: UIFnDomRoot, document: Document): Element | null {
  let active: Element | null = isShadowRoot(root)
    ? root.activeElement
    : isDocument(root)
      ? root.activeElement
      : root.contains(document.activeElement) ? document.activeElement : null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function eventOptionsKey(type: string, options?: AddEventListenerOptions | boolean): string {
  const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
  const passive = typeof options === 'object' ? options.passive ?? false : false;
  const onceValue = typeof options === 'object' ? options.once ?? false : false;
  return `${type}:${capture ? 1 : 0}:${passive ? 1 : 0}:${onceValue ? 1 : 0}`;
}

function observerConstructor<T>(
  environment: UIFnResolvedEnvironment,
  ownerWindow: Window,
  name: 'ResizeObserver' | 'IntersectionObserver' | 'MutationObserver',
  optional: boolean,
): T | undefined {
  const injected = environment.getCapability<T>(name);
  if (injected) return injected;
  const nativeValue = (ownerWindow as unknown as Record<string, unknown>)[name] as T | undefined;
  if (nativeValue) return nativeValue;
  if (optional) return undefined;
  return environment.requireCapability<T>(name);
}

export function createUIFnDomScope(options: CreateUIFnDomScopeOptions = {}): UIFnDomScope {
  const provisionalEnvironment = options.environment
    ? createUIFnEnvironment(options.environment)
    : null;
  const root = options.root ?? (provisionalEnvironment?.getRoot() as UIFnDomRoot | null);
  if (!root || !('addEventListener' in root) || !('querySelector' in root)) {
    throw createUIFnError({
      code: 'UIFN_DOM_SCOPE_INVALID',
      package: '@uifn/dom',
      component: 'DomScope',
      message: 'A DOM scope requires an injected Document, ShadowRoot, or HTMLElement root.',
      details: { hasRoot: !!root },
    });
  }
  const ownerDocument = ownerDocumentFor(root);
  const ownerWindow = ownerDocument?.defaultView ?? null;
  if (!ownerDocument || !ownerWindow) {
    throw createUIFnError({
      code: 'UIFN_DOM_SCOPE_INVALID',
      package: '@uifn/dom',
      component: 'DomScope',
      message: 'The DOM root must resolve an owner document and window.',
    });
  }
  const scheduler: UIFnScheduler = {
    now: () => ownerWindow.performance?.now() ?? Date.now(),
    setTimeout: (callback, delayMs) => ownerWindow.setTimeout(callback, delayMs),
    clearTimeout: (handle) => ownerWindow.clearTimeout(handle as number),
    setInterval: (callback, delayMs) => ownerWindow.setInterval(callback, delayMs),
    clearInterval: (handle) => ownerWindow.clearInterval(handle as number),
    requestAnimationFrame: (callback) => ownerWindow.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => ownerWindow.cancelAnimationFrame(handle as number),
    queueMicrotask: (callback) => ownerWindow.queueMicrotask(callback),
  };
  const defaults: UIFnEnvironment = {
    mode: 'production',
    root,
    ownerDocument,
    ownerWindow,
    scheduler,
    activeElement: () => activeElementDeep(root, ownerDocument),
    direction: () => {
      const element = isDocument(root) ? root.documentElement : isShadowRoot(root) ? root.host : root;
      return ownerWindow.getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
    },
    reducedMotion: () => ownerWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    forcedColors: () => ownerWindow.matchMedia?.('(forced-colors: active)').matches ?? false,
    query: <T = unknown>(selector: string) => root.querySelector(selector) as T | null,
    getById: <T = unknown>(id: string) => (isDocument(root)
      ? root.getElementById(id)
      : root.querySelector(`[id="${id.replaceAll('"', '\\"')}"]`)) as T | null,
  };
  const environment = options.environment
    && 'getRoot' in options.environment
    && typeof options.environment.getRoot === 'function'
    ? createUIFnEnvironment(options.environment)
    : createUIFnEnvironment({ ...defaults, ...(options.environment ?? {}), root });

  const resourceCounts = new Map<UIFnDomResourceKind, number>(
    RESOURCE_KINDS.map((kind) => [kind, 0]),
  );
  const cleanups: Array<() => void> = [];
  const delegated = new Map<string, DelegatedListener>();
  const traceRecords: UIFnDomTraceRecord[] = [];
  const traceLimit = Math.max(0, options.traceLimit ?? 200);
  let sequence = 0;
  let resourceSequence = 0;
  let destroyed = false;

  const record = (
    service: string,
    operation: string,
    resourceId?: string,
    details?: Readonly<Record<string, unknown>>,
  ) => {
    sequence += 1;
    const trace: UIFnDomTraceRecord = Object.freeze({
      sequence,
      service,
      operation,
      resourceId,
      timestamp: environment.now(),
      details,
    });
    if (traceLimit > 0) {
      traceRecords.push(trace);
      if (traceRecords.length > traceLimit) traceRecords.splice(0, traceRecords.length - traceLimit);
    }
    environment.trace({ kind: 'dom', operation: `${service}.${operation}`, timestamp: trace.timestamp, details });
  };

  const assertAlive = (operation: string) => {
    if (!destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'DomScope',
      message: `Cannot ${operation} after the DOM scope is destroyed.`,
      details: { operation, scopeId: environment.scopeId },
    });
  };

  const track = (
    kind: UIFnDomResourceKind,
    cleanup: () => void = () => undefined,
    providedId?: string,
  ) => {
    assertAlive(`track ${kind}`);
    resourceSequence += 1;
    const id = providedId ?? `${kind}-${resourceSequence}`;
    resourceCounts.set(kind, (resourceCounts.get(kind) ?? 0) + 1);
    record('scope', 'resource-acquire', id, { kind });
    const release = once(() => {
      try {
        cleanup();
      } finally {
        resourceCounts.set(kind, Math.max(0, (resourceCounts.get(kind) ?? 1) - 1));
        record('scope', 'resource-release', id, { kind });
      }
    });
    cleanups.push(release);
    return release;
  };

  const scope: UIFnDomScope = {
    environment,
    root,
    document: ownerDocument,
    window: ownerWindow,
    get destroyed() {
      return destroyed;
    },
    getActiveElement() {
      return activeElementDeep(root, ownerDocument);
    },
    query<T extends Element = Element>(selector: string) {
      return root.querySelector<T>(selector);
    },
    queryAll<T extends Element = Element>(selector: string) {
      return Array.from(root.querySelectorAll<T>(selector));
    },
    on(type, callback, listenerOptions) {
      assertAlive(`listen for ${type}`);
      const key = eventOptionsKey(type, listenerOptions);
      let entry = delegated.get(key);
      if (!entry) {
        const capture = typeof listenerOptions === 'boolean'
          ? listenerOptions
          : listenerOptions?.capture ?? false;
        const passive = typeof listenerOptions === 'object'
          ? listenerOptions.passive ?? false
          : false;
        const onceValue = typeof listenerOptions === 'object'
          ? listenerOptions.once ?? false
          : false;
        const callbacks = new Set<UIFnDomEventListener>();
        const nativeListener: EventListener = (event) => {
          for (const current of [...callbacks]) {
            try {
              current(event);
            } catch (error) {
              environment.error(createUIFnError({
                code: 'UIFN_UNSTABLE_ERROR',
                package: '@uifn/dom',
                component: 'DomScope',
                message: `A delegated ${type} listener failed.`,
                cause: error,
                recoverable: true,
                details: { type },
              }));
            }
          }
          if (onceValue) {
            callbacks.clear();
            root.removeEventListener(type, nativeListener, { capture });
            delegated.delete(key);
            resourceCounts.set('listener', Math.max(0, (resourceCounts.get('listener') ?? 1) - 1));
            record('scope', 'listener-remove', key, { type, once: true });
          }
        };
        entry = { type, capture, passive, once: onceValue, callbacks, nativeListener };
        delegated.set(key, entry);
        root.addEventListener(type, nativeListener, { capture, passive, once: false });
        resourceCounts.set('listener', (resourceCounts.get('listener') ?? 0) + 1);
        record('scope', 'listener-install', key, { type, capture, passive });
      }
      entry.callbacks.add(callback);
      return once(() => {
        const current = delegated.get(key);
        if (!current) return;
        current.callbacks.delete(callback);
        if (current.callbacks.size > 0) return;
        root.removeEventListener(type, current.nativeListener, { capture: current.capture });
        delegated.delete(key);
        resourceCounts.set('listener', Math.max(0, (resourceCounts.get('listener') ?? 1) - 1));
        record('scope', 'listener-remove', key, { type });
      });
    },
    track,
    setTimeout(callback, delayMs) {
      assertAlive('schedule timeout');
      let release: () => void = () => undefined;
      const handle = environment.scheduler.setTimeout(() => {
        release();
        if (!destroyed) callback();
      }, Math.max(0, delayMs));
      release = track('timer', () => environment.scheduler.clearTimeout(handle));
      return release;
    },
    requestAnimationFrame(callback) {
      assertAlive('schedule animation frame');
      let release: () => void = () => undefined;
      const handle = environment.scheduler.requestAnimationFrame((timestamp) => {
        release();
        if (!destroyed) callback(timestamp);
      });
      release = track('animationFrame', () => environment.scheduler.cancelAnimationFrame(handle));
      return release;
    },
    observeResize(target, callback, optional = false) {
      assertAlive('observe resize');
      const Constructor = observerConstructor<typeof ResizeObserver>(
        environment,
        ownerWindow,
        'ResizeObserver',
        optional,
      );
      if (!Constructor) return () => undefined;
      const observer = new Constructor(callback);
      observer.observe(target);
      return track('observer', () => observer.disconnect());
    },
    observeIntersection(target, callback, observerOptions, optional = false) {
      assertAlive('observe intersection');
      const Constructor = observerConstructor<typeof IntersectionObserver>(
        environment,
        ownerWindow,
        'IntersectionObserver',
        optional,
      );
      if (!Constructor) return () => undefined;
      const observer = new Constructor(callback, observerOptions);
      observer.observe(target);
      return track('observer', () => observer.disconnect());
    },
    observeMutation(target, callback, observerOptions, optional = false) {
      assertAlive('observe mutation');
      const Constructor = observerConstructor<typeof MutationObserver>(
        environment,
        ownerWindow,
        'MutationObserver',
        optional,
      );
      if (!Constructor) return () => undefined;
      const observer = new Constructor(callback);
      observer.observe(target, observerOptions);
      return track('observer', () => observer.disconnect());
    },
    resources() {
      const snapshot = Object.fromEntries(
        RESOURCE_KINDS.map((kind) => [kind, resourceCounts.get(kind) ?? 0]),
      ) as unknown as Record<UIFnDomResourceKind, number>;
      return Object.freeze({
        ...snapshot,
        total: RESOURCE_KINDS.reduce((total, kind) => total + (snapshot[kind] ?? 0), 0),
      });
    },
    trace() {
      return Object.freeze([...traceRecords]);
    },
    assertAlive,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of delegated.values()) {
        root.removeEventListener(entry.type, entry.nativeListener, { capture: entry.capture });
        resourceCounts.set('listener', Math.max(0, (resourceCounts.get('listener') ?? 1) - 1));
      }
      delegated.clear();
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch (error) {
          environment.error(createUIFnError({
            code: 'UIFN_UNSTABLE_ERROR',
            package: '@uifn/dom',
            component: 'DomScope',
            message: 'DOM scope cleanup failed.',
            recoverable: true,
            cause: error,
          }));
        }
      }
      record('scope', 'destroy');
    },
  };
  return scope;
}
