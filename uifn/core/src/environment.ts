import { createUIFnError, type UIFnError } from './errors';
import { normalizeUIFnToken } from './algorithms/id';

export type UIFnEnvironmentMode = 'production' | 'development' | 'test';
export type UIFnDirection = 'ltr' | 'rtl';
export type UIFnWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';

export interface UIFnEnvironmentWarning {
  readonly code: string;
  readonly component?: string;
  readonly part?: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface UIFnEnvironmentTrace {
  readonly kind: string;
  readonly operation: string;
  readonly timestamp: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface UIFnScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  queueMicrotask(callback: () => void): void;
}

/** Structural aliases keep core runtime DOM-free while allowing DOM adapters to supply native objects. */
export type UIFnRootNode = object;
export type UIFnOwnerDocument = object;
export type UIFnOwnerWindow = object;
export type UIFnActiveElement = object;

export interface UIFnEnvironment {
  readonly mode?: UIFnEnvironmentMode;
  readonly scopeId?: string;
  readonly hydrationSeed?: string;
  readonly root?: UIFnRootNode | (() => UIFnRootNode | null | undefined) | null;
  readonly ownerDocument?:
    | UIFnOwnerDocument
    | ((root: UIFnRootNode | null) => UIFnOwnerDocument | null | undefined)
    | null;
  readonly ownerWindow?:
    | UIFnOwnerWindow
    | ((document: UIFnOwnerDocument | null) => UIFnOwnerWindow | null | undefined)
    | null;
  readonly activeElement?: (
    root: UIFnRootNode | null,
  ) => UIFnActiveElement | null | undefined;
  readonly direction?: UIFnDirection | (() => UIFnDirection);
  readonly writingMode?: UIFnWritingMode | (() => UIFnWritingMode);
  readonly locale?: string | (() => string);
  readonly timeZone?: string | (() => string);
  readonly reducedMotion?: boolean | (() => boolean);
  readonly forcedColors?: boolean | (() => boolean);
  readonly generateId?: (scope: string) => string;
  readonly issuedIds?: Iterable<string>;
  readonly now?: () => number;
  readonly scheduler?: UIFnScheduler;
  readonly query?: <T = unknown>(selector: string, root: UIFnRootNode | null) => T | null;
  readonly getById?: <T = unknown>(id: string, root: UIFnRootNode | null) => T | null;
  readonly warn?: (warning: UIFnEnvironmentWarning) => void;
  readonly error?: (error: UIFnError) => void;
  readonly trace?: (trace: UIFnEnvironmentTrace) => void;
  readonly capabilities?: Readonly<Record<string, unknown>>;
}

export interface UIFnResolvedEnvironment {
  readonly mode: UIFnEnvironmentMode;
  readonly scopeId: string;
  readonly hydrationSeed: string;
  readonly generateId: (scope: string) => string;
  readonly issuedIds: readonly string[];
  readonly now: () => number;
  readonly scheduler: UIFnScheduler;
  readonly warn: (warning: UIFnEnvironmentWarning) => void;
  readonly error: (error: UIFnError) => void;
  readonly trace: (trace: UIFnEnvironmentTrace) => void;
  getRoot(): UIFnRootNode | null;
  getOwnerDocument(): UIFnOwnerDocument | null;
  getOwnerWindow(): UIFnOwnerWindow | null;
  getActiveElement(): UIFnActiveElement | null;
  getDirection(): UIFnDirection;
  getWritingMode(): UIFnWritingMode;
  getLocale(): string;
  getTimeZone(): string;
  prefersReducedMotion(): boolean;
  usesForcedColors(): boolean;
  query<T = unknown>(selector: string): T | null;
  getById<T = unknown>(id: string): T | null;
  getCapability<T>(name: string): T | undefined;
  requireCapability<T>(name: string): T;
  child(scope: string): UIFnResolvedEnvironment;
}

export interface UIFnIdAllocator {
  reserve(id: string, context?: string): string;
  next(prefix: string, scope?: string): string;
  fromToken(prefix: string, token: string, context?: string): string;
  snapshot(): string[];
}

export function normalizeUIFnIdToken(token: string): string {
  return normalizeUIFnToken(token);
}

export function composeUIFnEnvironmentId(prefix: string, token: string): string {
  const normalizedPrefix = normalizeUIFnIdToken(prefix);
  const normalizedToken = normalizeUIFnIdToken(token);
  if (!normalizedPrefix || !normalizedToken) {
    throw createUIFnError({
      code: 'UIFN_CORE_ENVIRONMENT_INVALID',
      package: '@uifn/core',
      component: 'Environment',
      message: 'Controller ids MUST be generated from non-empty string segments.',
      details: { prefix, token },
    });
  }
  if (normalizedToken === normalizedPrefix || normalizedToken.startsWith(`${normalizedPrefix}-`)) {
    return normalizedToken;
  }
  return `${normalizedPrefix}-${normalizedToken}`;
}

function resolveValue<T>(value: T | (() => T) | undefined, fallback: T): T {
  return typeof value === 'function' ? (value as () => T)() : value ?? fallback;
}

type TimerHost = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (callback: () => void, intervalMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
  queueMicrotask: (callback: () => void) => void;
};

function timerHost(): TimerHost {
  return globalThis as unknown as TimerHost;
}

function createDefaultScheduler(now: () => number): UIFnScheduler {
  const timers = timerHost();
  return {
    now,
    setTimeout(callback, delayMs) {
      return timers.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
      timers.clearTimeout(handle);
    },
    setInterval(callback, intervalMs) {
      return timers.setInterval(callback, intervalMs);
    },
    clearInterval(handle) {
      timers.clearInterval(handle);
    },
    requestAnimationFrame(callback) {
      return timers.setTimeout(() => callback(now()), 16);
    },
    cancelAnimationFrame(handle) {
      timers.clearTimeout(handle);
    },
    queueMicrotask(callback) {
      timers.queueMicrotask(callback);
    },
  };
}

function isResolvedEnvironment(env: UIFnEnvironment): env is UIFnResolvedEnvironment {
  const candidate = env as Partial<UIFnResolvedEnvironment>;
  return typeof candidate.getRoot === 'function'
    && typeof candidate.getOwnerDocument === 'function'
    && typeof candidate.requireCapability === 'function'
    && typeof candidate.child === 'function';
}

let implicitEnvironmentSequence = 0;

function createImplicitEnvironmentIdentity(): string {
  implicitEnvironmentSequence += 1;
  return `uifn-root-${implicitEnvironmentSequence}`;
}

export function createUIFnEnvironment(env: UIFnEnvironment = {}): UIFnResolvedEnvironment {
  if (isResolvedEnvironment(env)) return env;
  const implicitIdentity =
    env.scopeId === undefined
    && env.hydrationSeed === undefined
    && env.generateId === undefined
      ? createImplicitEnvironmentIdentity()
      : 'uifn-root';
  const scopeId = normalizeUIFnIdToken(env.scopeId ?? implicitIdentity) || implicitIdentity;
  const hydrationSeed = normalizeUIFnIdToken(env.hydrationSeed ?? scopeId) || scopeId;
  const now = env.now ?? env.scheduler?.now.bind(env.scheduler) ?? (() => Date.now());
  const scheduler = env.scheduler ?? createDefaultScheduler(now);
  const capabilities = Object.freeze({ ...(env.capabilities ?? {}) });
  const rootResolver = () => {
    const root = typeof env.root === 'function' ? env.root() : env.root;
    return root ?? null;
  };
  const documentResolver = () => {
    const root = rootResolver();
    const document =
      typeof env.ownerDocument === 'function'
        ? env.ownerDocument(root)
        : env.ownerDocument;
    return document ?? null;
  };
  const windowResolver = () => {
    const document = documentResolver();
    const ownerWindow =
      typeof env.ownerWindow === 'function'
        ? env.ownerWindow(document)
        : env.ownerWindow;
    return ownerWindow ?? null;
  };
  let counter = 0;
  const generateId =
    env.generateId ??
    ((token: string) => {
      counter += 1;
      return `${hydrationSeed}-${normalizeUIFnIdToken(token) || 'id'}-${counter}`;
    });

  const resolved: UIFnResolvedEnvironment = {
    mode: env.mode ?? 'production',
    scopeId,
    hydrationSeed,
    generateId(token) {
      const generated = generateId(token);
      if (typeof generated !== 'string' || normalizeUIFnIdToken(generated).length === 0) {
        throw createUIFnError({
          code: 'UIFN_CORE_ENVIRONMENT_INVALID',
          package: '@uifn/core',
          component: 'Environment',
          message: 'env.generateId MUST return a non-empty string.',
          details: { token, generated },
        });
      }
      return generated;
    },
    issuedIds: Object.freeze(Array.from(env.issuedIds ?? [])),
    now,
    scheduler,
    warn: env.warn ?? (() => undefined),
    error: env.error ?? (() => undefined),
    trace: env.trace ?? (() => undefined),
    getRoot: rootResolver,
    getOwnerDocument: documentResolver,
    getOwnerWindow: windowResolver,
    getActiveElement() {
      return env.activeElement?.(rootResolver()) ?? null;
    },
    getDirection() {
      return resolveValue(env.direction, 'ltr');
    },
    getWritingMode() {
      return resolveValue(env.writingMode, 'horizontal-tb');
    },
    getLocale() {
      return resolveValue(env.locale, 'en-US');
    },
    getTimeZone() {
      return resolveValue(env.timeZone, 'UTC');
    },
    prefersReducedMotion() {
      return resolveValue(env.reducedMotion, false);
    },
    usesForcedColors() {
      return resolveValue(env.forcedColors, false);
    },
    query<T>(selector: string) {
      return env.query?.<T>(selector, rootResolver()) ?? null;
    },
    getById<T>(id: string) {
      return env.getById?.<T>(id, rootResolver()) ?? null;
    },
    getCapability<T>(name: string) {
      return capabilities[name] as T | undefined;
    },
    requireCapability<T>(name: string) {
      const capability = capabilities[name] as T | undefined;
      if (capability !== undefined) return capability;
      throw createUIFnError({
        code: 'UIFN_ENV_CAPABILITY_MISSING',
        package: '@uifn/core',
        component: 'Environment',
        message: `Required environment capability "${name}" is unavailable.`,
        details: { name, scopeId },
      });
    },
    child(scope: string) {
      const childScope = `${scopeId}-${normalizeUIFnIdToken(scope) || 'child'}`;
      return createUIFnEnvironment({
        ...env,
        scopeId: childScope,
        hydrationSeed: `${hydrationSeed}-${normalizeUIFnIdToken(scope) || 'child'}`,
        issuedIds: resolved.issuedIds,
      });
    },
  };
  return Object.freeze(resolved);
}

export function createUIFnIdAllocator(
  env: UIFnResolvedEnvironment,
  component: string,
): UIFnIdAllocator {
  const issued = new Set(env.issuedIds.map((id) => normalizeUIFnIdToken(id)).filter(Boolean));
  const reserve = (id: string, context?: string) => {
    const normalized = normalizeUIFnIdToken(id);
    if (!normalized || issued.has(normalized)) {
      throw createUIFnError({
        code: 'UIFN_CORE_ENVIRONMENT_INVALID',
        package: '@uifn/core',
        component,
        message: 'Controller environment generated duplicate or invalid ids.',
        details: { id, normalized, context, scopeId: env.scopeId },
      });
    }
    issued.add(normalized);
    return normalized;
  };
  return {
    reserve,
    next(prefix, scope = prefix) {
      return reserve(composeUIFnEnvironmentId(prefix, env.generateId(scope)), scope);
    },
    fromToken(prefix, token, context = prefix) {
      return reserve(composeUIFnEnvironmentId(prefix, token), context);
    },
    snapshot() {
      return Array.from(issued).sort();
    },
  };
}
