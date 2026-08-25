import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  untrack,
  useContext,
  type Accessor,
  type Component,
  type Context,
  type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  type UIFnController,
  type UIFnEnvironment,
  type UIFnPartProps,
  type UIFnPartRef,
  type UIFnSnapshot,
  type UIFnStaticPrimitiveContract,
} from '@uifn/core';
import {
  mergePartProps,
  resolveUIFnDefaultPartContent,
  type UIFnDefaultPartContent,
} from '@uifn/core/parts';
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
  type UIFnDomResourceSnapshot,
  type UIFnPortalTarget,
} from '@uifn/dom';
import {
  createSolidPartPropsBinding,
  toSolidSpreadProps,
  toSolidUserPartProps,
  type SolidPartPropsBinding,
} from '../props.js';

export type AnyRecord = Record<string, unknown>;
type AnyController = UIFnController<AnyRecord, AnyRecord, AnyRecord, AnyRecord>;
type AnyStaticContract = UIFnStaticPrimitiveContract<AnyRecord, AnyRecord, AnyRecord>;
export type SolidElementName = Extract<keyof JSX.IntrinsicElements, string>;
type SolidElement = HTMLElement | SVGElement;

export interface SolidPrimitiveLifecycleCounters {
  readonly controllerGeneration: number;
  readonly controllerDestroyCount: number;
  readonly activeControllers: number;
  readonly domGeneration: number;
  readonly domDestroyCount: number;
  readonly registeredElements: number;
  readonly subscribers: number;
}

export interface SolidPrimitiveContextValue<TInputs extends object = AnyRecord> {
  readonly bridge: SolidPrimitiveBridge<TInputs>;
  readonly version: Accessor<number>;
}

export interface SolidPrimitiveDefinition<TInputs extends object = AnyRecord> {
  readonly name: string;
  readonly family: string;
  readonly kind: 'interactive-controller' | 'typed-static-contract';
  readonly rootPart: string;
  readonly inputNames: readonly string[];
  readonly context: Context<SolidPrimitiveContextValue<TInputs> | undefined>;
  readonly createController?: (inputs: TInputs, environment: UIFnEnvironment) => AnyController;
  readonly contract?: AnyStaticContract;
}

export interface SolidPrimitiveRenderPayload {
  readonly props: Accessor<Record<string, unknown>>;
  readonly ref: (element: SolidElement) => void;
  readonly state: Accessor<Readonly<AnyRecord>>;
  readonly actions: Accessor<Readonly<AnyRecord>>;
  readonly status: Accessor<string>;
  readonly counters: Accessor<SolidPrimitiveLifecycleCounters>;
  readonly bridge: SolidPrimitiveBridge;
}

export interface SolidPrimitiveCompositionProps {
  readonly children?: JSX.Element;
  readonly as?: SolidElementName | Component<AnyRecord>;
  readonly render?: (payload: SolidPrimitiveRenderPayload) => JSX.Element;
  readonly ref?: UIFnPartRef<SolidElement>;
}

export type SolidPrimitiveRootProps<
  TInputs extends object,
  TElement extends SolidElementName,
> = TInputs
  & Omit<JSX.IntrinsicElements[TElement], keyof TInputs | 'children' | 'ref'>
  & SolidPrimitiveCompositionProps
  & { readonly environment?: UIFnEnvironment };

type PartArgument<TPart> = TPart extends { getProps(value: infer TValue, ...rest: unknown[]): unknown }
  ? TValue
  : TPart extends (value: infer TValue, ...rest: unknown[]) => unknown
    ? TValue
    : unknown;

export type SolidPrimitivePartProps<
  TPart,
  TElement extends SolidElementName,
  TMany extends boolean,
> = Omit<JSX.IntrinsicElements[TElement], 'children' | 'ref'>
  & SolidPrimitiveCompositionProps
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

const RESERVED_ROOT_PROPS = new Set(['children', 'as', 'render', 'ref', 'environment']);
const ROOT_DOM_PROP = /^(?:aria-|data-)|^(?:id|class|className|style|title|role|tabindex|tabIndex|hidden|dir|lang|slot|inert|draggable|spellcheck|spellCheck|translate|name|type|value|checked|required|readonly|readOnly|multiple|placeholder|autocomplete|autoComplete|autofocus|autoFocus|inputmode|inputMode|maxlength|maxLength|minlength|minLength|pattern|min|max|step|accept|rows|cols|for|htmlFor|href|target|rel|src|alt|width|height|viewBox|action|method|enctype|encType)$/;
const ROOT_EVENT_PROP = /^on(?:Click|DblClick|DoubleClick|AuxClick|ContextMenu|KeyDown|KeyUp|KeyPress|Focus|Blur|Input|Change|BeforeInput|CompositionStart|CompositionUpdate|CompositionEnd|Copy|Cut|Paste|PointerDown|PointerMove|PointerUp|PointerCancel|PointerEnter|PointerLeave|PointerOver|PointerOut|MouseDown|MouseMove|MouseUp|MouseEnter|MouseLeave|MouseOver|MouseOut|TouchStart|TouchMove|TouchEnd|TouchCancel|Drag|DragStart|DragEnd|DragEnter|DragLeave|DragOver|Drop|Scroll|Wheel|Select|Submit|Reset|Invalid|Load|Error|AnimationStart|AnimationEnd|AnimationIteration|TransitionEnd|Toggle|BeforeToggle|GotPointerCapture|LostPointerCapture)(?:Capture)?$/;

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

/**
 * Keep primitive identity behind one adapter-owned entrypoint while delegating
 * its sequencing to Solid. createUniqueId is unique across independent client
 * roots and deterministic across paired hydratable server/client transforms.
 */
export function createSolidPrimitiveInstanceId(): string {
  return `uifn-${stableToken(createUniqueId())}`;
}

export function splitSolidRootProps(props: AnyRecord, inputNames: readonly string[] = []): {
  inputs: AnyRecord;
  dom: AnyRecord;
  environment?: UIFnEnvironment;
} {
  const inputs: AnyRecord = {};
  const dom: AnyRecord = {};
  const declaredInputs = new Set(inputNames);
  let environment: UIFnEnvironment | undefined;
  for (const key of Object.keys(props)) {
    if (RESERVED_ROOT_PROPS.has(key) && key !== 'environment') continue;
    const value = props[key];
    if (key === 'environment') environment = value as UIFnEnvironment | undefined;
    else if (declaredInputs.has(key)) inputs[key] = value;
    else if (ROOT_DOM_PROP.test(key) || ROOT_EVENT_PROP.test(key)) dom[key] = value;
    else inputs[key] = value;
  }
  return { inputs, dom, environment };
}

function stableToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '') || 'solid';
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

export class SolidPrimitiveBridge<TInputs extends object = AnyRecord> {
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

  constructor(
    readonly definition: SolidPrimitiveDefinition<TInputs>,
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
    this.releaseController = this.current.subscribe(() => this.emit());
    this.live = true;
    this.refreshDomOwnership();
  }

  private deactivate(): void {
    if (this.definition.kind !== 'interactive-controller' || !this.live) return;
    this.releaseDom?.();
    this.releaseDom = null;
    this.releaseController?.();
    this.releaseController = null;
    this.destroyCurrent();
    this.live = false;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.destroyed) throw new TypeError(`${this.definition.name} bridge is destroyed.`);
    this.activate();
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

  readonly getSnapshot = (): Readonly<UIFnSnapshot<AnyRecord>> => {
    if (this.current) return this.current.getSnapshot();
    if (this.staticProjection) return this.staticProjection.snapshot;
    if (this.definition.kind === 'interactive-controller' && !this.destroyed) {
      this.current = this.create(false);
      return this.current.getSnapshot();
    }
    throw new TypeError(`${this.definition.name} has no current projection.`);
  };

  getLifecycleCounters(): SolidPrimitiveLifecycleCounters {
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
    const changedKeys = [...keys].filter((key) => inputChanged(key, previous[key], next[key]));
    this.latestInputs.current = inputs;
    if (changedKeys.length === 0) return;
    if (this.definition.kind === 'typed-static-contract') {
      this.projectStatic();
      this.emit();
      return;
    }
    const previousVersion = this.current?.getSnapshot().version;
    this.current?.update(Object.fromEntries(changedKeys.map((key) => [key, next[key]])) as Partial<AnyRecord>);
    if (this.current?.getSnapshot().version === previousVersion) this.emit();
  }

  getPartProps(part: string, value: unknown, userProps: UIFnPartProps): UIFnPartProps {
    if (this.staticProjection) {
      const projected = this.staticProjection.parts[part];
      const generated = typeof projected === 'function' ? projected(value) : projected;
      if (!generated) throw new TypeError(`${this.definition.name}.${part} is absent from the public static contract.`);
      return mergePartProps(generated as UIFnPartProps, userProps);
    }
    const controllerPart = this.current?.parts[part] as { getProps(...args: unknown[]): UIFnPartProps } | undefined;
    if (!controllerPart) throw new TypeError(`${this.definition.name}.${part} is absent from the public core controller.`);
    return value === undefined ? controllerPart.getProps(userProps) : controllerPart.getProps(value, userProps);
  }

  registerElement(part: string, value: unknown, element: HTMLElement | null, portalTarget?: UIFnPortalTarget): void {
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
    const ownerDocument = root.ownerDocument?.defaultView
      ? root.ownerDocument
      : globalThis.document;
    const lease = acquireUIFnDomPlatform({ root: ownerDocument });
    const bindings: Array<{ destroy(): void }> = [];
    const controller = this.current;
    try {
      const reset = controller?.actions.reset;
      if (typeof reset === 'function') bindings.push(createUIFnNativeFormResetBinding(lease.platform.scope, root, () => reset()));
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
          focusInitial: false,
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
    this.releaseDom = () => {
      if (!active) return;
      active = false;
      this.domDestroyCount += 1;
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

function gestureTargets(bridge: SolidPrimitiveBridge<any>): ReadonlyArray<{ value?: unknown; element: HTMLElement }> {
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

function assignRef<TElement>(ref: UIFnPartRef<TElement>, value: TElement | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function renderSolidDefaultPartContent(content: UIFnDefaultPartContent | undefined): JSX.Element {
  if (content && typeof content === 'object' && content.kind === 'svg-path') {
    return <path d={content.d} fill="currentColor" />;
  }
  return typeof content === 'string' ? content : undefined;
}

interface SolidPrimitiveElementRuntimeProps {
  readonly bridge: SolidPrimitiveBridge<any>;
  readonly version: Accessor<number>;
  readonly part: string;
  readonly element: SolidElementName;
  readonly renderElement: Component<AnyRecord>;
  readonly many: boolean;
  readonly source: Accessor<AnyRecord>;
}

function SolidPrimitiveElement(runtime: SolidPrimitiveElementRuntimeProps): JSX.Element {
  const initial = untrack(runtime.source);
  const render = initial.render as SolidPrimitiveCompositionProps['render'];
  const component = (initial.as ?? runtime.renderElement) as SolidElementName | Component<AnyRecord>;
  let node: HTMLElement | null = null;
  let registeredValue: unknown;
  let registeredContainer: UIFnPortalTarget | undefined;
  let currentRef: UIFnPartRef<SolidElement>;
  let partPropsBinding: SolidPartPropsBinding | null = null;

  const value = () => runtime.many ? runtime.source().value : undefined;
  const userProps = createMemo(() => toSolidUserPartProps(runtime.source()));
  const projected = createMemo(() => {
    runtime.version();
    if (runtime.many && value() === undefined) {
      throw new TypeError(`${runtime.bridge.definition.name}.${runtime.part} requires a value prop.`);
    }
    const next = runtime.bridge.getPartProps(runtime.part, value(), userProps());
    if (runtime.source().forceMount && next.hidden !== undefined) {
      const forced = { ...next };
      delete forced.hidden;
      return forced;
    }
    return next;
  });
  const spreadProps = createMemo(() => toSolidSpreadProps(projected()));

  const register = (element: SolidElement): void => {
    node = element instanceof HTMLElement ? element : null;
    if (!node) return;
    currentRef = projected().ref as UIFnPartRef<SolidElement>;
    assignRef(currentRef, element);
    registeredValue = value();
    registeredContainer = runtime.source().container as UIFnPortalTarget | undefined;
    runtime.bridge.registerElement(runtime.part, registeredValue, node, registeredContainer);
    partPropsBinding?.destroy();
    partPropsBinding = createSolidPartPropsBinding(node, projected());
  };

  createEffect(() => {
    const next = projected();
    if (!node) return;
    partPropsBinding?.update(next);
  });

  createEffect(() => {
    const nextRef = projected().ref as UIFnPartRef<SolidElement>;
    if (Object.is(nextRef, currentRef)) return;
    if (currentRef) assignRef(currentRef, null);
    currentRef = nextRef;
    if (currentRef && node) assignRef(currentRef, node);
  });

  createEffect(() => {
    const nextValue = value();
    const nextContainer = runtime.source().container as UIFnPortalTarget | undefined;
    if (!node || (Object.is(nextValue, registeredValue) && Object.is(nextContainer, registeredContainer))) return;
    runtime.bridge.registerElement(runtime.part, registeredValue, null, registeredContainer);
    registeredValue = nextValue;
    registeredContainer = nextContainer;
    runtime.bridge.registerElement(runtime.part, registeredValue, node, registeredContainer);
  });

  onCleanup(() => {
    partPropsBinding?.destroy();
    partPropsBinding = null;
    if (currentRef) assignRef(currentRef, null);
    runtime.bridge.registerElement(runtime.part, registeredValue, null, registeredContainer);
    node = null;
  });

  const payload: SolidPrimitiveRenderPayload = {
    props: () => ({ ...spreadProps(), ref: register }),
    ref: register,
    state: () => {
      runtime.version();
      return runtime.bridge.getSnapshot().state;
    },
    actions: () => {
      runtime.version();
      return runtime.bridge.getActions();
    },
    status: () => {
      runtime.version();
      return runtime.bridge.getStatus();
    },
    counters: () => {
      runtime.version();
      return runtime.bridge.getLifecycleCounters();
    },
    bridge: runtime.bridge,
  };

  if (render) return render(payload);
  const elementProps: AnyRecord = { ...spreadProps(), ref: register };
  if (!VOID_ELEMENTS.has(runtime.element)) {
    Object.defineProperty(elementProps, 'children', {
      configurable: true,
      enumerable: true,
      get: () => {
        const children = runtime.source().children as JSX.Element;
        if (children !== undefined) return children;
        runtime.version();
        return renderSolidDefaultPartContent(
          resolveUIFnDefaultPartContent(
            runtime.bridge.definition.name,
            runtime.part,
            runtime.bridge.getSnapshot().state,
          ),
        );
      },
    });
  }
  const DynamicElement = Dynamic as unknown as Component<AnyRecord>;
  return <DynamicElement component={component} {...elementProps} />;
}

export interface SolidPrimitiveRootRuntimeProps<TInputs extends object> {
  readonly definition: SolidPrimitiveDefinition<TInputs>;
  readonly element: SolidElementName;
  readonly renderElement: Component<AnyRecord>;
  readonly hydrationId: string;
  readonly props: SolidPrimitiveRootProps<TInputs, SolidElementName>;
}

export function SolidPrimitiveRoot<TInputs extends object>(runtime: SolidPrimitiveRootRuntimeProps<TInputs>): JSX.Element {
  const uniqueId = runtime.hydrationId;
  const source = () => runtime.props as AnyRecord;
  const inputNames = runtime.definition.name === 'AngleSlider'
    ? [...runtime.definition.inputNames, 'name']
    : runtime.definition.inputNames;
  const initial = splitSolidRootProps(untrack(source), inputNames);
  const environment: UIFnEnvironment = {
    ...initial.environment,
    scopeId: initial.environment?.scopeId ?? `${runtime.definition.name}-${stableToken(uniqueId)}`,
    hydrationSeed: initial.environment?.hydrationSeed ?? stableToken(uniqueId),
  };
  const bridge = new SolidPrimitiveBridge(runtime.definition, initial.inputs as TInputs, environment);
  const [version, setVersion] = createSignal(0, { equals: false });
  const split = createMemo(() => splitSolidRootProps(source(), inputNames));
  const elementSource = (): AnyRecord => {
    const current = source();
    const elementProps: AnyRecord = {
      ...split().dom,
      as: current.as,
      render: current.render,
      ref: current.ref,
    };
    Object.defineProperty(elementProps, 'children', {
      configurable: true,
      enumerable: true,
      get: () => source().children,
    });
    return elementProps;
  };
  let release: (() => void) | undefined;

  createEffect(() => {
    bridge.update(split().inputs as TInputs);
  });
  onMount(() => {
    release = bridge.subscribe(() => setVersion((current) => current + 1));
  });
  onCleanup(() => {
    release?.();
    bridge.destroy();
  });

  const context: SolidPrimitiveContextValue<TInputs> = { bridge, version };
  return (
    <runtime.definition.context.Provider value={context}>
      <SolidPrimitiveElement
        bridge={bridge}
        version={version}
        part={runtime.definition.rootPart}
        element={runtime.element}
        renderElement={runtime.renderElement}
        many={false}
        source={elementSource}
      />
    </runtime.definition.context.Provider>
  );
}

export interface SolidPrimitivePartRuntimeProps {
  readonly definition: SolidPrimitiveDefinition;
  readonly part: string;
  readonly element: SolidElementName;
  readonly renderElement: Component<AnyRecord>;
  readonly many: boolean;
  readonly props: SolidPrimitivePartProps<unknown, SolidElementName, boolean>;
}

export function SolidPrimitivePart(runtime: SolidPrimitivePartRuntimeProps): JSX.Element {
  const context = useContext(runtime.definition.context);
  if (!context || context.bridge.definition !== runtime.definition) {
    throw new TypeError(`${runtime.definition.name}.${runtime.part} MUST be rendered inside ${runtime.definition.name}.Root.`);
  }
  return (
    <SolidPrimitiveElement
      bridge={context.bridge}
      version={context.version}
      part={runtime.part}
      element={runtime.element}
      renderElement={runtime.renderElement}
      many={runtime.many}
      source={() => runtime.props as AnyRecord}
    />
  );
}
