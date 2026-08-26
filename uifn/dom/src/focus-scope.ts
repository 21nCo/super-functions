import { createUIFnError } from '@uifn/core/errors';
import {
  focusUIFnElement,
  getUIFnTabbable,
  isUIFnFocusable,
} from './focusable';
import type { UIFnDomScope } from './scope';

export interface UIFnCancelableFocusEvent {
  readonly type: 'mountAutoFocus' | 'unmountAutoFocus';
  readonly defaultPrevented: boolean;
  readonly target: HTMLElement | null;
  preventDefault(): void;
}

export interface UIFnFocusScopeOptions {
  readonly id?: string;
  readonly container: HTMLElement | (() => HTMLElement | null);
  readonly enabled?: boolean;
  readonly trapped?: boolean;
  readonly loop?: boolean;
  readonly initialFocus?: HTMLElement | (() => HTMLElement | null) | null;
  readonly returnFocus?: boolean;
  readonly restoreFocus?: HTMLElement | (() => HTMLElement | null) | null;
  readonly fallbackFocus?: HTMLElement | (() => HTMLElement | null) | null;
  readonly branches?: readonly HTMLElement[];
  readonly deferInitialFocus?: boolean;
  readonly onMountAutoFocus?: (event: UIFnCancelableFocusEvent) => void;
  readonly onUnmountAutoFocus?: (event: UIFnCancelableFocusEvent) => void;
}

export interface UIFnFocusScopeHandle {
  readonly id: string;
  readonly active: boolean;
  readonly paused: boolean;
  addBranch(element: HTMLElement): () => void;
  pause(): void;
  resume(): void;
  update(options: Partial<Omit<UIFnFocusScopeOptions, 'id'>>): void;
  focusInitial(): boolean;
  destroy(): void;
}

export interface UIFnFocusScopeManager {
  readonly size: number;
  readonly activeScopeId: string | null;
  register(options: UIFnFocusScopeOptions): UIFnFocusScopeHandle;
  destroy(): void;
}

interface FocusScopeRecord {
  readonly id: string;
  options: UIFnFocusScopeOptions;
  readonly trigger: Element | null;
  lastFocused: HTMLElement | null;
  paused: boolean;
  destroyed: boolean;
  cancelInitial: () => void;
  readonly releaseResource: () => void;
  addedTabIndex: boolean;
  readonly branches: Set<HTMLElement>;
}

function resolveElement(
  value: HTMLElement | (() => HTMLElement | null) | null | undefined,
): HTMLElement | null {
  return typeof value === 'function' ? value() : value ?? null;
}

function resolveContainer(record: FocusScopeRecord): HTMLElement | null {
  return resolveElement(record.options.container);
}

function createFocusEvent(
  type: UIFnCancelableFocusEvent['type'],
  target: HTMLElement | null,
): UIFnCancelableFocusEvent {
  let prevented = false;
  return {
    type,
    target,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

function pathIncludesScope(event: Event, record: FocusScopeRecord, container: HTMLElement): boolean {
  const path = event.composedPath();
  return path.includes(container) || [...record.branches].some((branch) => path.includes(branch));
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return !!value
    && typeof value === 'object'
    && (value as Node).nodeType === 1
    && 'focus' in value;
}

export function createUIFnFocusScopeManager(scope: UIFnDomScope): UIFnFocusScopeManager {
  scope.assertAlive('create focus scope manager');
  const records: FocusScopeRecord[] = [];
  let sequence = 0;
  let destroyed = false;

  const assertManagerAlive = (operation: string, record?: FocusScopeRecord) => {
    scope.assertAlive(operation);
    if (!destroyed && !record?.destroyed) return;
    throw createUIFnError({
      code: 'UIFN_DOM_SERVICE_DESTROYED',
      package: '@uifn/dom',
      component: 'FocusScope',
      message: `Cannot ${operation} after the focus scope service is destroyed.`,
    });
  };

  const top = () => {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (
        !record.destroyed
        && !record.paused
        && record.options.enabled !== false
      ) return record;
    }
    return null;
  };

  const trace = (operation: string, record: FocusScopeRecord, details?: Record<string, unknown>) => {
    scope.environment.trace({
      kind: 'dom-focus-scope',
      operation,
      timestamp: scope.environment.now(),
      details: { scopeId: record.id, ...details },
    });
  };

  const tabbable = (container: HTMLElement, branches: ReadonlySet<HTMLElement> = new Set()) => {
    const layoutless = scope.document.documentElement.getClientRects().length === 0;
    const options = { displayCheck: layoutless ? 'none' as const : 'full' as const };
    return [
      ...getUIFnTabbable(container, options),
      ...[...branches].flatMap((branch) => getUIFnTabbable(branch, options)),
    ].filter((element, index, all) => all.indexOf(element) === index);
  };

  const focusInitialRecord = (record: FocusScopeRecord): boolean => {
    const container = resolveContainer(record);
    if (!container || record.destroyed || record.paused || record.options.enabled === false) return false;
    const explicit = resolveElement(record.options.initialFocus);
    const candidate = explicit ?? tabbable(container, record.branches)[0] ?? container;
    const event = createFocusEvent('mountAutoFocus', candidate);
    record.options.onMountAutoFocus?.(event);
    if (event.defaultPrevented) {
      trace('initial-focus-canceled', record);
      return false;
    }
    if (candidate === container && !isUIFnFocusable(container)) {
      if (!container.hasAttribute('tabindex')) {
        container.tabIndex = -1;
        record.addedTabIndex = true;
      }
    }
    const focused = focusUIFnElement(candidate);
    if (focused) record.lastFocused = candidate;
    trace('initial-focus', record, { focused });
    return focused;
  };

  const restoreRecordFocus = (record: FocusScopeRecord): boolean => {
    if (record.options.returnFocus === false) return false;
    const explicit = resolveElement(record.options.restoreFocus);
    const trigger = isHTMLElement(record.trigger) ? record.trigger : null;
    const parent = top();
    const parentContainer = parent ? resolveContainer(parent) : null;
    const parentLastFocused = parent?.lastFocused;
    const parentFallback = parentLastFocused?.isConnected && isUIFnFocusable(parentLastFocused)
      ? parentLastFocused
      : parentContainer
        ? tabbable(parentContainer, parent?.branches)[0] ?? parentContainer
        : null;
    const fallback = resolveElement(record.options.fallbackFocus)
      ?? parentFallback
      ?? scope.document.body;
    const target = explicit ?? trigger;
    const event = createFocusEvent('unmountAutoFocus', target ?? fallback);
    record.options.onUnmountAutoFocus?.(event);
    if (event.defaultPrevented) {
      trace('restore-focus-canceled', record);
      return false;
    }
    const restored = focusUIFnElement(target) || focusUIFnElement(fallback);
    trace('restore-focus', record, {
      restored,
      usedFallback: !target || !target.isConnected || !isUIFnFocusable(target),
    });
    if (!restored && record.options.trapped !== false) {
      scope.environment.error(createUIFnError({
        code: 'UIFN_FOCUS_RESTORE_FAILED',
        package: '@uifn/dom',
        component: 'FocusScope',
        message: 'No connected focus restoration target or fallback was available.',
        recoverable: true,
        details: { focusScopeId: record.id },
      }));
    }
    return restored;
  };

  const releases = [
    scope.on('focusin', (event) => {
      const record = top();
      if (!record) return;
      const container = resolveContainer(record);
      if (!container) return;
      const target = event.target;
      if (isHTMLElement(target) && pathIncludesScope(event, record, container)) {
        record.lastFocused = target;
        return;
      }
      if (record.options.trapped === false) return;
      const fallback = record.lastFocused && record.lastFocused.isConnected
        ? record.lastFocused
        : tabbable(container, record.branches)[0] ?? container;
      if (!focusUIFnElement(fallback)) {
        scope.environment.error(createUIFnError({
          code: 'UIFN_FOCUS_SCOPE_ESCAPE',
          package: '@uifn/dom',
          component: 'FocusScope',
          message: 'Focus escaped and the active scope had no focusable fallback.',
          recoverable: false,
          details: { focusScopeId: record.id },
        }));
      }
      trace('contain-focus', record);
    }, true),
    scope.on('keydown', (rawEvent) => {
      const event = rawEvent as KeyboardEvent;
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const record = top();
      if (!record || (record.options.trapped === false && record.options.loop === false)) return;
      const container = resolveContainer(record);
      if (!container) return;
      const candidates = tabbable(container, record.branches);
      if (candidates.length === 0) {
        if (record.options.trapped !== false) {
          event.preventDefault();
          if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
          focusUIFnElement(container);
        }
        return;
      }
      const active = scope.getActiveElement();
      const index = candidates.indexOf(active as HTMLElement);
      const atStart = index <= 0;
      const atEnd = index === candidates.length - 1 || index < 0;
      if (event.shiftKey && atStart && (record.options.loop !== false || record.options.trapped !== false)) {
        event.preventDefault();
        focusUIFnElement(candidates[candidates.length - 1]);
        return;
      }
      if (!event.shiftKey && atEnd && (record.options.loop !== false || record.options.trapped !== false)) {
        event.preventDefault();
        focusUIFnElement(candidates[0]);
      }
    }, true),
  ];

  return {
    get size() {
      return records.filter((record) => !record.destroyed).length;
    },
    get activeScopeId() {
      return top()?.id ?? null;
    },
    register(options) {
      assertManagerAlive('register focus scope');
      sequence += 1;
      const id = options.id ?? `focus-scope-${sequence}`;
      const previous = top();
      if (previous) previous.paused = true;
      const record: FocusScopeRecord = {
        id,
        options,
        trigger: scope.getActiveElement(),
        lastFocused: null,
        paused: false,
        destroyed: false,
        cancelInitial: () => undefined,
        releaseResource: scope.track('focusScope', () => undefined, id),
        addedTabIndex: false,
        branches: new Set(options.branches ?? []),
      };
      records.push(record);
      trace('register', record, { parentId: previous?.id });
      if (options.deferInitialFocus) {
        record.cancelInitial = scope.setTimeout(() => focusInitialRecord(record), 0);
      } else {
        focusInitialRecord(record);
      }
      return {
        id,
        get active() {
          return top() === record;
        },
        get paused() {
          return record.paused;
        },
        addBranch(element) {
          assertManagerAlive('register focus scope branch', record);
          record.branches.add(element);
          trace('branch-register', record, { branchCount: record.branches.size });
          let active = true;
          return () => {
            if (!active) return;
            active = false;
            record.branches.delete(element);
            trace('branch-remove', record, { branchCount: record.branches.size });
          };
        },
        pause() {
          assertManagerAlive('pause focus scope', record);
          record.paused = true;
          trace('pause', record);
        },
        resume() {
          assertManagerAlive('resume focus scope', record);
          record.paused = false;
          trace('resume', record);
        },
        update(next) {
          assertManagerAlive('update focus scope', record);
          record.options = { ...record.options, ...next };
          trace('update', record);
        },
        focusInitial() {
          assertManagerAlive('focus initial element', record);
          record.cancelInitial();
          return focusInitialRecord(record);
        },
        destroy() {
          if (record.destroyed) return;
          record.destroyed = true;
          record.cancelInitial();
          const index = records.indexOf(record);
          if (index >= 0) records.splice(index, 1);
          const parent = [...records].reverse().find((candidate) =>
            !candidate.destroyed && candidate.options.enabled !== false) ?? null;
          if (parent) parent.paused = false;
          record.releaseResource();
          restoreRecordFocus(record);
          const container = resolveContainer(record);
          if (record.addedTabIndex && container?.getAttribute('tabindex') === '-1') {
            container.removeAttribute('tabindex');
          }
          record.branches.clear();
          trace('destroy', record, { resumedParentId: parent?.id });
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const record of [...records].reverse()) {
        record.destroyed = true;
        record.cancelInitial();
        record.releaseResource();
        const container = resolveContainer(record);
        if (record.addedTabIndex && container?.getAttribute('tabindex') === '-1') {
          container.removeAttribute('tabindex');
        }
        record.branches.clear();
      }
      records.length = 0;
      releases.forEach((release) => release());
    },
  };
}
