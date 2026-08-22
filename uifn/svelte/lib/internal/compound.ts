import {
  type UIFnController,
  type UIFnEnvironment,
  type UIFnPartProps,
  type UIFnSnapshot,
  type UIFnStaticPrimitiveContract,
} from '@uifn/core';
import { mergePartProps } from '@uifn/core/parts';
import {
  acquireUIFnDomPlatform,
  createUIFnMenuDomBinding,
  createUIFnNativeFormResetBinding,
  createUIFnNavigationMenuDomBinding,
  createUIFnOverlayDomBinding,
  createUIFnPopupDomBinding,
  createUIFnPortal,
  createUIFnRangeGestureDomBinding,
  createUIFnRovingFocusDomBinding,
  focusUIFnElement,
  type UIFnDomResourceSnapshot,
  type UIFnPortalTarget,
} from '@uifn/dom';
import type { Snippet } from 'svelte';
import type { SvelteHTMLElements } from 'svelte/elements';

export type AnyRecord = Record<string, unknown>;
type AnyController = UIFnController<AnyRecord, AnyRecord, AnyRecord, AnyRecord>;
type AnyStaticContract = UIFnStaticPrimitiveContract<AnyRecord, AnyRecord, AnyRecord>;
export type SvelteElementName = Extract<keyof SvelteHTMLElements, string>;

export interface SveltePrimitiveDefinition<TInputs extends object = AnyRecord> {
  readonly name: string;
  readonly family: string;
  readonly kind: 'interactive-controller' | 'typed-static-contract';
  readonly rootPart: string;
  readonly inputNames: readonly string[];
  readonly contextKey: symbol;
  readonly createController?: (inputs: TInputs, environment: UIFnEnvironment) => AnyController;
  readonly contract?: AnyStaticContract;
}

export interface SveltePrimitiveRenderPayload {
  readonly props: Record<string, unknown>;
  readonly action: (node: HTMLElement, params?: UIFnPartProps) => {
    update(next?: UIFnPartProps): void;
    destroy(): void;
  };
  readonly actionParams: UIFnPartProps;
  readonly state: Readonly<AnyRecord>;
  readonly actions: Readonly<AnyRecord>;
  readonly status: string;
  readonly bridge: SveltePrimitiveBridge;
}

export interface SveltePrimitiveCompositionProps {
  readonly children?: Snippet;
  readonly render?: Snippet<[SveltePrimitiveRenderPayload]>;
  readonly ref?: HTMLElement | SVGElement | null;
}

export type SveltePrimitiveRootProps<
  TInputs extends object,
  TElement extends SvelteElementName,
> = TInputs
  & Omit<SvelteHTMLElements[TElement], keyof TInputs | 'children'>
  & SveltePrimitiveCompositionProps
  & { readonly environment?: UIFnEnvironment };

type PartArgument<TPart> = TPart extends { getProps(value: infer TValue, ...rest: unknown[]): unknown }
  ? TValue
  : TPart extends (value: infer TValue, ...rest: unknown[]) => unknown
    ? TValue
    : unknown;

export type SveltePrimitivePartProps<
  TPart,
  TElement extends SvelteElementName,
  TMany extends boolean,
> = Omit<SvelteHTMLElements[TElement], 'children'>
  & SveltePrimitiveCompositionProps
  & (TMany extends true ? { readonly value: PartArgument<TPart> } : { readonly value?: never })
  & {
    readonly forceMount?: boolean;
    readonly container?: UIFnPortalTarget;
  };

interface StaticProjection {
  readonly snapshot: Readonly<UIFnSnapshot<AnyRecord>>;
  readonly parts: AnyRecord;
}

interface RegisteredElement {
  readonly element: HTMLElement;
  readonly portalTarget?: UIFnPortalTarget;
}

interface SvelteDomBinding {
  update?: (...args: any[]) => void;
  destroy(): void;
}

const ROOT_DOM_PROP = /^(?:aria-|data-)|^(?:id|class|className|style|title|role|tabindex|tabIndex|hidden|dir|lang|slot|inert|draggable|spellcheck|spellCheck|translate|name|type|value|checked|required|readonly|readOnly|multiple|placeholder|autocomplete|autofocus|min|max|step|accept|rows|cols|for|href|target|rel|src|alt|width|height|viewBox)$/;
const ROOT_EVENT_PROP = /^on(?::)?[a-z]/;
const UNDECLARED_NATIVE_PROP = /^(?:pattern|form|formaction|formAction|formenctype|formEnctype|formmethod|formMethod|formnovalidate|formNoValidate|formtarget|formTarget|maxlength|maxLength|minlength|minLength|inputmode|inputMode|download|capture|size|wrap|kind|label|cite|datetime|dateTime|open|reversed|start|colspan|colSpan|rowspan|rowSpan)$/;
let browserNativeProps: ReadonlySet<string> | undefined;

function isUndeclaredNativeProp(key: string): boolean {
  if (UNDECLARED_NATIVE_PROP.test(key)) return true;
  if (typeof document === 'undefined') return false;
  if (!browserNativeProps) {
    const names = new Set<string>();
    for (const tag of ['a', 'button', 'details', 'dialog', 'form', 'iframe', 'img', 'input', 'label', 'li', 'meter', 'ol', 'option', 'output', 'progress', 'select', 'source', 'table', 'td', 'textarea', 'th', 'time', 'track', 'video']) {
      let prototype: object | null = document.createElement(tag);
      while (prototype && prototype !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
          names.add(name);
          names.add(name.toLowerCase());
        }
        prototype = Object.getPrototypeOf(prototype) as object | null;
      }
    }
    browserNativeProps = names;
  }
  return browserNativeProps.has(key) || browserNativeProps.has(key.toLowerCase());
}

const EMPTY_DOM_RESOURCES: UIFnDomResourceSnapshot = Object.freeze({
  listener: 0,
  observer: 0,
  timer: 0,
  animationFrame: 0,
  layer: 0,
  focusScope: 0,
  modalLock: 0,
  positioner: 0,
  portal: 0,
  presence: 0,
  formBridge: 0,
  liveRegion: 0,
  modality: 0,
  total: 0,
});

export function splitSvelteRootProps(props: AnyRecord, inputNames: readonly string[] = []): {
  inputs: AnyRecord;
  dom: AnyRecord;
  environment?: UIFnEnvironment;
} {
  const inputs: AnyRecord = {};
  const dom: AnyRecord = {};
  let environment: UIFnEnvironment | undefined;
  const declaredInputs = new Set(inputNames);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'environment') environment = value as UIFnEnvironment | undefined;
    else if (declaredInputs.has(key) || /^on[A-Z]/.test(key)) inputs[key] = value;
    else if (ROOT_DOM_PROP.test(key) || ROOT_EVENT_PROP.test(key)) dom[key] = value;
    else {
      inputs[key] = value;
      if (isUndeclaredNativeProp(key)) dom[key] = value;
    }
  }
  return { inputs, dom, environment };
}

function stableToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '') || 'svelte';
}

function inertScheduler() {
  let nextHandle = 0;
  return {
    now: () => 0,
    setTimeout: () => ++nextHandle,
    clearTimeout: () => undefined,
    setInterval: () => ++nextHandle,
    clearInterval: () => undefined,
    requestAnimationFrame: () => ++nextHandle,
    cancelAnimationFrame: () => undefined,
    queueMicrotask: () => undefined,
  };
}

function inputProxy<TInputs extends object>(latest: { current: TInputs }): TInputs {
  const functions = new Map<PropertyKey, (...args: unknown[]) => unknown>();
  return new Proxy({} as TInputs, {
    get(_target, key) {
      const value = (latest.current as AnyRecord)[key as string];
      if (typeof value !== 'function') return value;
      let delegate = functions.get(key);
      if (!delegate) {
        delegate = (...args: unknown[]) => {
          const current = (latest.current as AnyRecord)[key as string];
          return typeof current === 'function' ? current(...args) : undefined;
        };
        functions.set(key, delegate);
      }
      return delegate;
    },
    has(_target, key) {
      return key in latest.current;
    },
    ownKeys() {
      return Reflect.ownKeys(latest.current);
    },
    getOwnPropertyDescriptor(_target, key) {
      return key in latest.current ? { enumerable: true, configurable: true } : undefined;
    },
  });
}

function equalInput(left: unknown, right: unknown, depth = 0): boolean {
  if (Object.is(left, right)) return true;
  if (depth > 3 || !left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalInput(value, right[index], depth + 1));
  }
  if (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype) return false;
  const leftRecord = left as AnyRecord;
  const rightRecord = right as AnyRecord;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length
    && keys.every((key) => equalInput(leftRecord[key], rightRecord[key], depth + 1));
}

function inputChanged(key: string, previous: unknown, next: unknown): boolean {
  if (typeof previous === 'function' || typeof next === 'function') {
    return !/^on[A-Z]/.test(key) && !Object.is(previous, next);
  }
  return !equalInput(previous, next);
}

export class SveltePrimitiveBridge<TInputs extends object = AnyRecord> {
  private readonly listeners = new Set<() => void>();
  private readonly elements = new Map<string, RegisteredElement>();
  private readonly latestInputs: { current: TInputs };
  private readonly proxiedInputs: TInputs;
  private current: AnyController | null = null;
  private releaseController: (() => void) | null = null;
  private releaseDom: (() => void) | null = null;
  private staticProjection: StaticProjection | null = null;
  private live = false;
  private destroyed = false;
  private generation = 0;
  private controllerDestroyCount = 0;
  private domGeneration = 0;
  private domDestroyCount = 0;
  private lastDomResources = EMPTY_DOM_RESOURCES;
  private domRefreshQueued = false;
  private domRefreshEpoch = 0;
  private domCommitQueued = false;
  private domBindings: readonly SvelteDomBinding[] = [];
  private cancelDeferredRovingFocus: (() => void) | null = null;
  private menubarWasOpen = false;

  constructor(
    readonly definition: SveltePrimitiveDefinition<TInputs>,
    inputs: TInputs,
    private readonly environment: UIFnEnvironment,
  ) {
    this.latestInputs = { current: inputs };
    this.proxiedInputs = inputProxy(this.latestInputs);
    if (definition.kind === 'interactive-controller') this.current = this.create(false);
    else this.projectStatic();
  }

  private scopedEnvironment(live: boolean): UIFnEnvironment {
    const root = () => this.getElement(this.definition.rootPart);
    const token = stableToken(String(this.environment.hydrationSeed ?? this.environment.scopeId ?? this.definition.name));
    return {
      ...this.environment,
      mode: this.environment.mode ?? (live ? 'production' : 'test'),
      scopeId: this.environment.scopeId ?? token,
      hydrationSeed: this.environment.hydrationSeed ?? token,
      root,
      ownerDocument: (candidate) => (candidate as HTMLElement | null)?.ownerDocument ?? null,
      ownerWindow: (document) => (document as Document | null)?.defaultView ?? null,
      generateId: this.environment.generateId ?? ((scope) => `${scope}-${token}`),
      scheduler: live ? this.environment.scheduler : inertScheduler(),
      now: live ? this.environment.now : () => 0,
    };
  }

  private create(live: boolean): AnyController {
    const factory = this.definition.createController;
    if (!factory) throw new TypeError(`${this.definition.name} has no controller factory.`);
    this.generation += 1;
    return factory(this.proxiedInputs, this.scopedEnvironment(live));
  }

  private destroyCurrent(): void {
    if (!this.current) return;
    this.current.destroy();
    this.current = null;
    this.controllerDestroyCount += 1;
  }

  private projectStatic(): void {
    const contract = this.definition.contract;
    if (!contract) throw new TypeError(`${this.definition.name} has no static contract.`);
    const inputs = this.latestInputs.current as AnyRecord;
    const state = contract.getState(inputs);
    this.generation += 1;
    this.staticProjection = {
      snapshot: Object.freeze({ version: this.generation, status: 'idle', state }),
      parts: contract.getParts(inputs, {
        scopeId: String(this.environment.scopeId ?? this.environment.hydrationSeed ?? this.definition.name),
      }),
    };
  }

  private activate(): void {
    if (this.definition.kind !== 'interactive-controller' || this.live || this.destroyed) return;
    this.releaseController?.();
    this.releaseController = null;
    this.destroyCurrent();
    this.current = this.create(true);
    this.releaseController = this.current.subscribe(() => {
      this.emit();
      this.scheduleDeferredRovingFocus();
    }, { emitInitial: false });
    this.live = true;
    this.menubarWasOpen = Boolean(this.current.getState().value);
    this.refreshDomOwnership();
  }

  /**
   * Promote the deterministic pre-DOM projection to the live browser
   * controller before compound children read their first part props.
   *
   * Svelte initializes child actions before root effects run. Waiting for the
   * first subscription would therefore let children retain handlers and refs
   * from the destroyed pre-DOM controller during hydration.
   */
  connect(): void {
    this.activate();
  }

  private deactivate(): void {
    if (this.definition.kind !== 'interactive-controller' || !this.live) return;
    this.releaseDom?.();
    this.releaseDom = null;
    this.releaseController?.();
    this.releaseController = null;
    this.cancelDeferredRovingFocus?.();
    this.cancelDeferredRovingFocus = null;
    this.destroyCurrent();
    this.live = false;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.destroyed) throw new TypeError(`${this.definition.name} bridge is destroyed.`);
    const firstSubscriber = this.listeners.size === 0;
    this.activate();
    // connect() may have promoted the controller before the root action was
    // registered. The first effect subscription is the first point where the
    // committed root can be acquired synchronously.
    if (firstSubscriber && this.live) this.refreshDomOwnership();
    this.listeners.add(listener);
    listener();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.deactivate();
    };
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Svelte commits action parameters after controller subscribers run. Defer
   * Menubar's focus transfer until the next frame so the new active item and
   * its roving tabindex have both reached the DOM.
   */
  private scheduleDeferredRovingFocus(): void {
    if (this.definition.name !== 'Menubar' || this.destroyed) return;
    const controller = this.current;
    const root = this.getElement(this.definition.rootPart);
    if (!controller || !root) return;
    const state = controller.getState();
    const open = Boolean(state.value);
    const shouldRestore = this.menubarWasOpen && !open;
    this.menubarWasOpen = open;
    if (!open && !shouldRestore) return;

    this.cancelDeferredRovingFocus?.();
    const ownerWindow = root.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const focusAfterCommit = () => {
      this.cancelDeferredRovingFocus = null;
      if (this.destroyed || this.current !== controller) return;
      const current = controller.getState();
      const currentOpen = Boolean(current.value);
      const activeKey = String(
        currentOpen
          ? current.activeItem ?? ''
          : current.focusReturn ?? current.focusedMenu ?? '',
      );
      if (!activeKey) return;
      const parts = currentOpen ? ['item', 'submenuTrigger'] : ['trigger'];
      const target = parts
        .map((part) => this.getElement(part, activeKey))
        .find((element): element is HTMLElement => Boolean(element))
        ?? (currentOpen
          ? this.getElementEntries('item').find(({ element }) => element.tabIndex === 0)?.element
          : null);
      if (target?.isConnected && root.ownerDocument.activeElement !== target) {
        target.focus({ preventScroll: true });
      }
    };
    if (typeof ownerWindow.requestAnimationFrame === 'function') {
      const frame = ownerWindow.requestAnimationFrame(focusAfterCommit);
      this.cancelDeferredRovingFocus = () => ownerWindow.cancelAnimationFrame(frame);
    } else {
      const timer = ownerWindow.setTimeout(focusAfterCommit, 0);
      this.cancelDeferredRovingFocus = () => ownerWindow.clearTimeout(timer);
    }
  }

  readonly getSnapshot = (): Readonly<UIFnSnapshot<AnyRecord>> => {
    if (this.current) return this.current.getSnapshot();
    if (this.staticProjection) return this.staticProjection.snapshot;
    if (this.definition.kind === 'interactive-controller' && !this.destroyed) {
      this.current = this.create(false);
      return this.current.getSnapshot();
    }
    throw new TypeError(`${this.definition.name} has no current projection.`);
  };

  getGeneration(): number { return this.generation; }
  getLifecycleCounters(): Readonly<{
    controllerGeneration: number;
    controllerDestroyCount: number;
    activeControllers: number;
    domGeneration: number;
    domDestroyCount: number;
    registeredElements: number;
    subscribers: number;
  }> {
    return Object.freeze({
      controllerGeneration: this.generation,
      controllerDestroyCount: this.controllerDestroyCount,
      activeControllers: this.current ? 1 : 0,
      domGeneration: this.domGeneration,
      domDestroyCount: this.domDestroyCount,
      registeredElements: this.elements.size,
      subscribers: this.listeners.size,
    });
  }
  getController(): AnyController | null { return this.current; }
  getDomResources(): Readonly<UIFnDomResourceSnapshot> { return this.lastDomResources; }
  getActions(): AnyRecord { return this.current?.actions ?? {}; }
  getStatus(): string { return this.current?.status ?? this.staticProjection?.snapshot.status ?? 'idle'; }

  update(inputs: TInputs): void {
    if (this.destroyed) return;
    const previous = this.latestInputs.current as AnyRecord;
    const next = inputs as AnyRecord;
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const currentState = this.current?.getState() ?? {};
    const changedKeys = [...keys]
      .filter((key) => inputChanged(key, previous[key], next[key]))
      .filter((key) => !(
        Object.prototype.hasOwnProperty.call(currentState, key)
        && equalInput(currentState[key], next[key])
      ));
    this.latestInputs.current = inputs;
    if (changedKeys.length === 0) return;
    if (this.definition.kind === 'typed-static-contract') {
      this.projectStatic();
      this.emit();
      return;
    }
    this.current?.update(Object.fromEntries(changedKeys.map((key) => [key, next[key]])) as Partial<AnyRecord>);
  }

  getPartProps(part: string, value: unknown, userProps: UIFnPartProps): UIFnPartProps {
    if (this.staticProjection) {
      const projected = this.staticProjection.parts[part];
      const generated = typeof projected === 'function'
        ? projected(value)
        : projected;
      if (!generated) throw new TypeError(`${this.definition.name}.${part} is absent from the public static contract.`);
      return mergePartProps(generated as UIFnPartProps, userProps);
    }
    const controllerPart = this.current?.parts[part] as { getProps(...args: unknown[]): UIFnPartProps } | undefined;
    if (!controllerPart) throw new TypeError(`${this.definition.name}.${part} is absent from the public core controller.`);
    return value === undefined ? controllerPart.getProps(userProps) : controllerPart.getProps(value, userProps);
  }

  registerElement(
    part: string,
    value: unknown,
    element: HTMLElement | null,
    portalTarget?: UIFnPortalTarget,
  ): void {
    if (this.destroyed) return;
    const key = `${part}:${value === undefined ? '' : String(value)}`;
    const previous = this.elements.get(key);
    if (element && previous?.element === element && Object.is(previous.portalTarget, portalTarget)) return;
    if (element) this.elements.set(key, { element, portalTarget });
    else this.elements.delete(key);
    this.scheduleDomOwnershipRefresh();
  }

  private scheduleDomOwnershipRefresh(): void {
    if (this.domRefreshQueued || this.destroyed) return;
    this.domRefreshQueued = true;
    const epoch = this.domRefreshEpoch;
    globalThis.queueMicrotask(() => {
      if (this.destroyed || epoch !== this.domRefreshEpoch) return;
      this.domRefreshQueued = false;
      this.refreshDomOwnership();
    });
  }

  /**
   * Svelte actions apply controller-driven attributes after store subscribers
   * run. Re-sync the already-owned DOM services once that commit has landed.
   */
  notifyDomCommit(): void {
    if (this.domCommitQueued || this.destroyed) return;
    this.domCommitQueued = true;
    const epoch = this.domRefreshEpoch;
    globalThis.queueMicrotask(() => {
      this.domCommitQueued = false;
      if (this.destroyed || epoch !== this.domRefreshEpoch) return;
      this.domBindings.forEach((binding) => {
        // Portal and gesture handles require update arguments; controller-
        // subscribed focus, overlay, and navigation bindings expose update().
        if (binding.update?.length === 0) binding.update();
      });
      const controller = this.current;
      if (this.definition.name === 'Menubar' && controller) {
        const state = controller.getState();
        const activeItem = state.value ? String(state.activeItem ?? '') : '';
        const target = activeItem
          ? this.getElement('item', activeItem) ?? this.getElement('submenuTrigger', activeItem)
          : null;
        if (target?.isConnected) focusUIFnElement(target);
      }
    });
  }

  getElement(part: string, value?: unknown): HTMLElement | null {
    return this.elements.get(`${part}:${value === undefined ? '' : String(value)}`)?.element ?? null;
  }

  getElementEntries(part: string): ReadonlyArray<{ value: string; element: HTMLElement }> {
    const prefix = `${part}:`;
    return [...this.elements.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, record]) => ({ value: key.slice(prefix.length), element: record.element }));
  }

  private refreshDomOwnership(): void {
    this.domRefreshEpoch += 1;
    this.domRefreshQueued = false;
    this.releaseDom?.();
    this.releaseDom = null;
    if (this.destroyed || (this.definition.kind === 'interactive-controller' && !this.live)) return;
    const root = this.getElement(this.definition.rootPart);
    if (!root) return;
    const lease = acquireUIFnDomPlatform({ root: root.ownerDocument });
    const bindings: SvelteDomBinding[] = [];
    const controller = this.current;
    try {
      const reset = controller?.actions.reset;
      if (typeof reset === 'function') {
        bindings.push(createUIFnNativeFormResetBinding(lease.platform.scope, root, () => reset()));
      }
      for (const [key, record] of this.elements) {
        if (!key.startsWith('portal:')) continue;
        bindings.push(createUIFnPortal(lease.platform.scope, {
          id: record.element.id || `${this.definition.name.toLowerCase()}-${stableToken(key)}`,
          node: record.element,
          target: record.portalTarget,
          restoreOnDestroy: true,
        }));
      }
      if (this.definition.family === 'modal-overlay') {
        const content = this.getElement('content');
        if (content && controller) {
          bindings.push(createUIFnOverlayDomBinding({
            platform: lease.platform,
            controller: controller as never,
            content,
            trigger: () => {
              if (this.definition.name !== 'Tour') return this.getElement('trigger');
              const target = (controller.getState().currentStep as { target?: unknown } | undefined)?.target;
              return typeof target === 'string'
                ? content.ownerDocument.querySelector<HTMLElement>(target)
                : null;
            },
            positioner: () => this.getElement('positioner'),
            arrow: () => this.getElement('arrow'),
            portalNode: this.getElement('portal') ?? this.getElement('positioner') ?? content,
            portalManagedExternally: this.getElement('portal') !== null,
            validateAccessibleName: true,
          }));
        }
      }
      if ((this.definition.name === 'Menu' || this.definition.name === 'ContextMenu') && controller) {
        const trigger = this.getElement('trigger');
        const content = this.getElement('content');
        if (trigger && content) {
          bindings.push(createUIFnMenuDomBinding({
            platform: lease.platform,
            controller: controller as never,
            id: content.id,
            trigger,
            content,
            positioner: () => this.getElement('positioner'),
            portalManagedExternally: this.getElement('portal') !== null,
            getItemElement: (id) => this.getElement('item', id),
          }));
        }
      }
      if (
        controller
        && ['Autocomplete', 'Combobox', 'Select', 'ColorPicker', 'DatePicker'].includes(this.definition.name)
      ) {
        const content = this.getElement('content');
        const trigger = this.definition.name === 'Autocomplete'
          ? this.getElement('input')
          : this.getElement('trigger');
        const reference = ['Autocomplete', 'Combobox', 'Select', 'ColorPicker'].includes(this.definition.name)
          ? this.getElement('control') ?? this.getElement('input') ?? trigger
          : this.definition.name === 'DatePicker'
            ? this.getElement('input') ?? trigger
            : trigger;
        const setOpen = controller.actions.setOpen;
        if (content && trigger && reference && typeof setOpen === 'function') {
          bindings.push(createUIFnPopupDomBinding({
            platform: lease.platform,
            controller: controller as never,
            id: root.id || `${this.definition.name.toLowerCase()}-popup`,
            trigger: () => (
              this.definition.name === 'Autocomplete'
                ? this.getElement('input')
                : this.getElement('trigger')
            ),
            reference: () => (
              ['Autocomplete', 'Combobox', 'Select', 'ColorPicker'].includes(this.definition.name)
                ? this.getElement('control') ?? this.getElement('input') ?? this.getElement('trigger')
                : this.definition.name === 'DatePicker'
                  ? this.getElement('input') ?? this.getElement('trigger')
                  : this.getElement('trigger')
            ),
            content: () => this.getElement('content'),
            positioner: () => this.getElement('positioner'),
            portalNode: this.getElement('portal') ?? this.getElement('positioner'),
            portalManagedExternally: this.getElement('portal') !== null,
            placement: 'bottom-start',
            matchReferenceWidth: ['Autocomplete', 'Combobox', 'Select'].includes(this.definition.name),
            getOpen: (state: Record<string, unknown>) => state.open === true,
            setOpen: (next: boolean) => (setOpen as (value: boolean) => void)(next),
          }));
        }
      }
      if (this.definition.name === 'NavigationMenu' && controller) {
        bindings.push(createUIFnNavigationMenuDomBinding({
          platform: lease.platform,
          controller: controller as never,
          getTriggerElement: (id) => this.getElement('trigger', id),
        }));
      }
      const roving = rovingTarget(this.definition.name, controller?.getState() ?? null);
      if (controller && roving) {
        bindings.push(createUIFnRovingFocusDomBinding({
          platform: lease.platform,
          controller,
          getActiveKey: (state) => roving.getActiveKey(state as AnyRecord),
          getElement: (key) => roving.getParts(controller.getState())
            .map((part) => roving.valueScoped ? this.getElement(part, key) : this.getElement(part))
            .find(Boolean) ?? null,
          // Svelte can register late compound children after the controller is
          // already open. In that case a newly acquired Menubar binding must
          // honor the active item instead of dropping the original focus job.
          focusInitial: this.definition.name === 'Menubar' && Boolean(controller.getState().value),
        }));
      }
      if (controller) {
        for (const target of gestureTargets(this)) {
          bindings.push(createUIFnRangeGestureDomBinding({
            scope: lease.platform.scope,
            primitive: this.definition.name as never,
            element: target.element,
            value: target.value,
            controller: controller as never,
          }));
        }
      }
    } catch (error) {
      bindings.reverse().forEach((binding) => binding.destroy());
      lease.release();
      throw error;
    }
    let active = true;
    this.domGeneration += 1;
    this.domBindings = bindings;
    this.releaseDom = () => {
      if (!active) return;
      active = false;
      this.domDestroyCount += 1;
      this.domBindings = [];
      bindings.reverse().forEach((binding) => binding.destroy());
      lease.release();
      this.lastDomResources = Object.freeze({ ...lease.platform.scope.resources() });
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.domRefreshEpoch += 1;
    this.domRefreshQueued = false;
    this.domCommitQueued = false;
    this.cancelDeferredRovingFocus?.();
    this.cancelDeferredRovingFocus = null;
    this.domBindings = [];
    this.releaseDom?.();
    this.releaseDom = null;
    this.releaseController?.();
    this.releaseController = null;
    this.destroyCurrent();
    this.listeners.clear();
    this.elements.clear();
    this.live = false;
  }
}

function gestureTargets(bridge: SveltePrimitiveBridge<any>): ReadonlyArray<{ value?: unknown; element: HTMLElement }> {
  const single = (part: string) => {
    const element = bridge.getElement(part);
    return element ? [{ element }] : [];
  };
  if (bridge.definition.name === 'Slider') return single('control');
  if (bridge.definition.name === 'AngleSlider') return single('track');
  if (bridge.definition.name === 'Carousel') return single('viewport');
  if (bridge.definition.name === 'SignaturePad') return single('canvas');
  if (bridge.definition.name === 'ImageCropper') return [...single('cropArea'), ...bridge.getElementEntries('handle')];
  if (bridge.definition.name === 'ColorPicker') return [...single('area'), ...bridge.getElementEntries('channelSlider')];
  if (bridge.definition.name === 'Splitter') return bridge.getElementEntries('resizeHandle').map(({ value, element }) => ({ value: Number(value), element }));
  if (bridge.definition.name === 'ScrollArea') return bridge.getElementEntries('thumb');
  return [];
}

interface RovingTarget {
  getActiveKey(state: AnyRecord): string | null;
  getParts(state: AnyRecord): readonly string[];
  readonly valueScoped: boolean;
}

function rovingTarget(name: string, state: AnyRecord | null): RovingTarget | null {
  if (!state) return null;
  if (name === 'Menubar') return {
    getActiveKey: (current) => String(current.value ? current.activeItem ?? '' : current.focusedMenu ?? '') || null,
    getParts: (current) => current.value ? ['item', 'submenuTrigger'] : ['trigger'],
    valueScoped: true,
  };
  const fixed = (stateKey: string, parts: readonly string[]): RovingTarget => ({
    getActiveKey: (current) => String(current[stateKey] ?? '') || null,
    getParts: () => parts,
    valueScoped: true,
  });
  if (name === 'ColorPicker') return {
    getActiveKey: (current) => current.open ? null : 'trigger',
    getParts: () => ['trigger'],
    valueScoped: false,
  };
  if (name === 'Editable') return {
    getActiveKey: (current) => current.editing ? 'input' : 'preview',
    getParts: (current) => current.editing ? ['input'] : ['preview'],
    valueScoped: false,
  };
  if (name === 'PinInput') return {
    getActiveKey: (current) => String(Math.max(0, Number(current.valueLength ?? 0) - (current.completed ? 1 : 0))),
    getParts: () => ['input'],
    valueScoped: true,
  };
  if (name === 'NavigationMenu') return fixed('focusedItem', ['trigger']);
  if (name === 'Tabs') return fixed('focusedItem', ['trigger']);
  if (name === 'Toolbar') return fixed('focusedItem', ['button', 'link']);
  if (name === 'Pagination') return fixed('focusedPage', ['pageTrigger']);
  if (name === 'TreeView') return fixed('focusedItem', ['item']);
  if (['CheckboxGroup', 'Listbox', 'RadioGroup', 'SegmentGroup', 'ToggleGroup'].includes(name)) {
    return fixed('focusedItem', ['itemControl', 'item']);
  }
  return null;
}
