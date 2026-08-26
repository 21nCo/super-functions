import { describe, expect, it, vi } from 'vitest';
import { createUIFnController, type UIFnControllerBackendMeta } from '../controller';
import { UIFnError } from '../errors';
import { createUIFnEnvironment } from '../environment';
import { composeUIFnRefs, mergePartProps, type UIFnPartEvent } from '../parts';
import * as publicCore from '../index';

const PUBLIC_CONTROLLER_FACTORIES = [
  'createAccordionController', 'createAlertDialogController',
  'createCheckboxController', 'createCollapsibleController', 'createComboboxController',
  'createContextMenuController', 'createDialogController', 'createMenuController',
  'createDrawerController', 'createFloatingPanelController',
  'createHoverCardController', 'createImageCropperController', 'createMenubarController',
  'createNavigationMenuController', 'createPaginationController', 'createPopoverController',
  'createProgressController', 'createRadioGroupController', 'createScrollAreaController',
  'createSelectController', 'createSliderController',
  'createSwitchController', 'createTabsController', 'createToastController', 'createTreeViewController',
  'createToggleController', 'createToggleGroupController', 'createToolbarController',
  'createTooltipController', 'createTourController',
] as const;

interface HarnessState {
  value: string;
  count: number;
}

interface HarnessInputs {
  value?: string;
}

interface HarnessEvent {
  readonly type: string;
}

function createHarness(controlled = true) {
  let state: HarnessState = { value: 'one', count: 0 };
  const listeners = new Set<(
    state: HarnessState,
    meta?: UIFnControllerBackendMeta<HarnessEvent>,
  ) => void>();
  const requested: string[] = [];
  let cleanupCount = 0;
  const emit = (meta: UIFnControllerBackendMeta<HarnessEvent>) => {
    listeners.forEach((listener) => listener(state, meta));
  };
  const rawActions = {
    requestValue(value: string) {
      requested.push(value);
      if (!controlled) {
        state = { ...state, value };
        emit({ event: { type: 'VALUE' }, source: 'user', reason: 'value-requested', requestedValue: value });
      }
    },
    increment() {
      state = { ...state, count: state.count + 1 };
      emit({ event: { type: 'INCREMENT' }, source: 'programmatic', reason: 'increment' });
    },
  };
  const parts = {
    trigger: {
      name: 'trigger' as const,
      getProps() {
        return { on: { click: () => rawActions.increment() } };
      },
    },
  };
  const controller = createUIFnController<
    HarnessState,
    typeof rawActions,
    typeof parts,
    HarnessInputs,
    HarnessEvent,
    UIFnControllerBackendMeta<HarnessEvent>
  >({
    actions: rawActions,
    parts,
    getState: () => state,
    update(inputs) {
      if (inputs.value === undefined || inputs.value === state.value) return;
      state = { ...state, value: inputs.value };
      emit({
        event: { type: 'SYNC' },
        source: 'controlled-sync',
        reason: 'controlled-value-sync',
        requestedValue: inputs.value,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      cleanupCount += 1;
      listeners.clear();
    },
    now: () => 42,
  });
  return { controller, requested, getCleanupCount: () => cleanupCount };
}

describe('PHASE_04 public controller contract', () => {
  it('exposes the uniform lifecycle for every current public controller factory', () => {
    for (const factoryName of PUBLIC_CONTROLLER_FACTORIES) {
      const factory = publicCore[factoryName] as (inputs?: Record<string, unknown>) => {
        readonly status: string;
        readonly state: unknown;
        readonly snapshot: { readonly version: number; readonly status: string };
        readonly actions: Record<string, unknown>;
        readonly parts: Record<string, { getProps?: () => unknown }>;
        update(inputs: Record<string, never>): void;
        subscribe(callback: (state: unknown) => void): () => void;
        destroy(): void;
      };
      const inputs = factoryName === 'createImageCropperController'
        ? { src: '/image.png' }
        : factoryName === 'createPaginationController'
          ? { count: 100 }
          : factoryName === 'createTreeViewController'
            ? { items: [{ id: 'one' }] }
        : factoryName === 'createTourController'
          ? { steps: [{ id: 'one', title: 'One', target: '#one' }] }
          : undefined;
      const controller = factory(inputs);
      const initial = vi.fn();
      const unsubscribe = controller.subscribe(initial);

      expect(controller.status).toBe('running');
      expect(controller.snapshot.version).toBe(0);
      expect(initial).toHaveBeenCalledTimes(1);
      controller.update({});
      Object.values(controller.parts)[0]?.getProps?.();
      unsubscribe();
      controller.destroy();
      controller.destroy();
      expect(controller.status).toBe('destroyed');
      expect(() => controller.update({})).toThrowError(UIFnError);
    }
  });

  it('keeps controlled requests and synchronization in separate transactions', () => {
    const { controller, requested } = createHarness(true);
    const seen: Array<{ value: string; reason?: string; transactionId?: number }> = [];
    controller.subscribe((state, meta) => {
      seen.push({ value: state.value, reason: meta?.reason, transactionId: meta?.transactionId });
    });

    controller.actions.requestValue('two');
    expect(requested).toEqual(['two']);
    expect(controller.state.value).toBe('one');
    expect(seen).toEqual([{ value: 'one', reason: undefined, transactionId: undefined }]);

    controller.update({ value: 'two' });
    expect(controller.state.value).toBe('two');
    expect(seen[1]).toEqual({ value: 'two', reason: 'controlled-value-sync', transactionId: 1 });
    expect(controller.snapshot.version).toBe(1);
    expect(Object.isFrozen(controller.snapshot)).toBe(true);
    expect(Object.isFrozen(controller.state)).toBe(true);
  });

  it('synchronizes every current controlled public controller without echoing callbacks', () => {
    const cases: Array<{
      name: string;
      create: (onChange: ReturnType<typeof vi.fn>) => {
        readonly state: unknown;
        update(inputs: Record<string, unknown>): void;
        destroy(): void;
      };
      inputs: Record<string, unknown>;
      read: (state: any) => unknown;
      expected: unknown;
    }> = [
      {
        name: 'Accordion',
        create: (onChange) => publicCore.createAccordionController({ type: 'single', value: 'one', items: ['one', 'two'], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'Checkbox',
        create: (onChange) => publicCore.createCheckboxController({ checked: false, onCheckedChange: onChange }),
        inputs: { checked: true }, read: (state) => state.checked, expected: true,
      },
      {
        name: 'Collapsible',
        create: (onChange) => publicCore.createCollapsibleController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'Combobox',
        create: (onChange) => publicCore.createComboboxController({ value: 'one', items: ['one', 'two'], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'ContextMenu',
        create: (onChange) => publicCore.createContextMenuController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'Dialog',
        create: (onChange) => publicCore.createDialogController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'Menu',
        create: (onChange) => publicCore.createMenuController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'HoverCard',
        create: (onChange) => publicCore.createHoverCardController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'Menubar',
        create: (onChange) => publicCore.createMenubarController({ value: 'one', items: [{ id: 'one' }, { id: 'two' }], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'NavigationMenu',
        create: (onChange) => publicCore.createNavigationMenuController({ value: 'one', items: [{ id: 'one' }, { id: 'two' }], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'Pagination',
        create: (onChange) => publicCore.createPaginationController({ count: 100, page: 1, onPageChange: onChange }),
        inputs: { page: 2 }, read: (state) => state.page, expected: 2,
      },
      {
        name: 'Popover',
        create: (onChange) => publicCore.createPopoverController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'Progress',
        create: (onChange) => publicCore.createProgressController({ value: 10, onValueChange: onChange }),
        inputs: { value: 20 }, read: (state) => state.value, expected: 20,
      },
      {
        name: 'RadioGroup',
        create: (onChange) => publicCore.createRadioGroupController({ value: 'one', items: ['one', 'two'], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'Select',
        create: (onChange) => publicCore.createSelectController({ value: 'one', items: ['one', 'two'], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'Slider',
        create: (onChange) => publicCore.createSliderController({ value: [10], onValueChange: onChange }),
        inputs: { value: [20] }, read: (state) => state.value, expected: [20],
      },
      {
        name: 'Switch',
        create: (onChange) => publicCore.createSwitchController({ checked: false, onCheckedChange: onChange }),
        inputs: { checked: true }, read: (state) => state.checked, expected: true,
      },
      {
        name: 'Tabs',
        create: (onChange) => publicCore.createTabsController({ value: 'one', items: ['one', 'two'], onValueChange: onChange }),
        inputs: { value: 'two' }, read: (state) => state.value, expected: 'two',
      },
      {
        name: 'Toggle',
        create: (onChange) => publicCore.createToggleController({ pressed: false, onPressedChange: onChange }),
        inputs: { pressed: true }, read: (state) => state.pressed, expected: true,
      },
      {
        name: 'ToggleGroup',
        create: (onChange) => publicCore.createToggleGroupController({ type: 'multiple', value: ['one'], onValueChange: onChange }),
        inputs: { value: ['two'] }, read: (state) => state.value, expected: ['two'],
      },
      {
        name: 'Tooltip',
        create: (onChange) => publicCore.createTooltipController({ open: false, onOpenChange: onChange }),
        inputs: { open: true }, read: (state) => state.open, expected: true,
      },
      {
        name: 'TreeView expanded',
        create: (onChange) => publicCore.createTreeViewController({ items: [{ id: 'one', children: [{ id: 'child' }] }], expanded: [], onExpandedChange: onChange }),
        inputs: { expanded: ['one'] }, read: (state) => state.expanded, expected: ['one'],
      },
    ];

    for (const entry of cases) {
      const onChange = vi.fn();
      const controller = entry.create(onChange);
      controller.update(entry.inputs);
      expect(entry.read(controller.state), entry.name).toEqual(entry.expected);
      expect(onChange, entry.name).not.toHaveBeenCalled();
      controller.destroy();
    }
  });

  it('queues reentrant notifications and applies selector equality', () => {
    const { controller } = createHarness(false);
    const counts: number[] = [];
    const values: string[] = [];
    controller.subscribe((count) => {
      counts.push(count);
      if (count === 1) controller.actions.increment();
    }, { selector: (state) => state.count, emitInitial: false });
    controller.subscribe((value) => values.push(value), {
      selector: (state) => state.value,
      emitInitial: false,
    });

    controller.actions.increment();
    expect(counts).toEqual([1, 2]);
    expect(values).toEqual([]);
  });

  it('destroys synchronously once and guards every mutating route', () => {
    const { controller, getCleanupCount } = createHarness(false);
    controller.actions.increment();
    const terminalState = controller.state;
    controller.destroy();
    controller.destroy();

    expect(controller.status).toBe('destroyed');
    expect(controller.state).toEqual(terminalState);
    expect(controller.snapshot.status).toBe('destroyed');
    expect(getCleanupCount()).toBe(1);
    expect(() => controller.actions.increment()).toThrowError(UIFnError);
    expect(() => controller.update({ value: 'two' })).toThrowError(UIFnError);
    expect(() => controller.parts.trigger.getProps().on?.click?.()).toThrowError(UIFnError);
    for (const operation of [
      () => controller.actions.increment(),
      () => controller.update({ value: 'two' }),
    ]) {
      try {
        operation();
      } catch (error) {
        expect((error as UIFnError).code).toBe('UIFN_CONTROLLER_DESTROYED');
      }
    }
  });
});

describe('PHASE_04 typed part composition', () => {
  it('runs the user first, honors cancellation, and protects only declared invariants', () => {
    const order: string[] = [];
    let prevented = false;
    const event: UIFnPartEvent = {
      type: 'click',
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    const props = mergePartProps(
      {
        role: 'option',
        id: 'option-one',
        data: { state: 'checked', custom: 'generated' },
        on: { click: () => order.push('internal') },
      },
      {
        role: 'button',
        id: 'consumer-id',
        data: { state: 'unchecked', custom: 'consumer' },
        on: {
          click(nextEvent) {
            order.push('user');
            nextEvent?.preventDefault?.();
          },
        },
      },
      {
        component: 'Select',
        part: 'option',
        required: { role: true, id: true, data: ['state'] },
      },
    );

    props.on?.click?.(event);
    expect(order).toEqual(['user']);
    expect(props.role).toBe('option');
    expect(props.id).toBe('option-one');
    expect(props.data).toMatchObject({ state: 'checked', custom: 'consumer' });
    expect(props.warnings).toEqual(['UIFN_PART_INVARIANT_OVERRIDDEN']);
  });

  it('composes refs/classes/styles and clears refs exactly once', () => {
    const first = vi.fn();
    const second = { current: null as { id: string } | null };
    const ref = composeUIFnRefs(first, second);
    const element = { id: 'trigger' };
    ref(element);
    ref(element);
    ref(null);
    ref(null);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second.current).toBeNull();

    const props = mergePartProps(
      { class: 'generated', className: 'generated-name', style: { color: 'red', opacity: 0.5 } },
      { class: 'consumer', className: 'consumer-name', style: { color: 'blue' } },
    );
    expect(props.class).toBe('generated consumer');
    expect(props.className).toBe('generated-name consumer-name');
    expect(props.style).toEqual({ color: 'blue', opacity: 0.5 });
  });
});

describe('PHASE_04 environment scope', () => {
  it('isolates document, iframe, shadow-root, ids, preferences, and capabilities', () => {
    const documentRoot = { kind: 'document' };
    const iframeDocument = { kind: 'iframe-document' };
    const iframeWindow = { kind: 'iframe-window' };
    const shadowRoot = { kind: 'shadow-root' };
    const active = { kind: 'active-element' };
    const env = createUIFnEnvironment({
      mode: 'test',
      scopeId: 'shadow',
      hydrationSeed: 'request-7',
      root: shadowRoot,
      ownerDocument: () => iframeDocument,
      ownerWindow: () => iframeWindow,
      activeElement: () => active,
      direction: 'rtl',
      writingMode: 'vertical-rl',
      locale: 'ar-SA',
      timeZone: 'Asia/Kolkata',
      reducedMotion: true,
      forcedColors: true,
      query: (_selector, root) => root,
      getById: () => documentRoot,
      capabilities: { ResizeObserver: class ResizeObserverDouble {} },
    });

    expect(env.getRoot()).toBe(shadowRoot);
    expect(env.getOwnerDocument()).toBe(iframeDocument);
    expect(env.getOwnerWindow()).toBe(iframeWindow);
    expect(env.getActiveElement()).toBe(active);
    expect(env.getDirection()).toBe('rtl');
    expect(env.getWritingMode()).toBe('vertical-rl');
    expect(env.getLocale()).toBe('ar-SA');
    expect(env.getTimeZone()).toBe('Asia/Kolkata');
    expect(env.prefersReducedMotion()).toBe(true);
    expect(env.usesForcedColors()).toBe(true);
    expect(env.query('[role=dialog]')).toBe(shadowRoot);
    expect(env.getById('trigger')).toBe(documentRoot);
    expect(env.requireCapability('ResizeObserver')).toBeTypeOf('function');
    expect(env.generateId('trigger')).toBe('request-7-trigger-1');
    expect(env.child('nested').generateId('trigger')).toBe('request-7-nested-trigger-1');
    expect(() => env.requireCapability('MutationObserver')).toThrowError(UIFnError);

    const firstRoot = createUIFnEnvironment({ scopeId: 'first-root', hydrationSeed: 'request-a' });
    const secondRoot = createUIFnEnvironment({ scopeId: 'second-root', hydrationSeed: 'request-b' });
    const firstController = publicCore.createComboboxController({ items: ['one'] }, firstRoot);
    const siblingController = publicCore.createComboboxController({ items: ['one'] }, firstRoot);
    const secondController = publicCore.createComboboxController({ items: ['one'] }, secondRoot);
    expect(firstController.state.ids.baseId).not.toBe(siblingController.state.ids.baseId);
    expect(firstController.state.ids.baseId).not.toBe(secondController.state.ids.baseId);
    firstController.destroy();
    siblingController.destroy();
    secondController.destroy();

    const defaultFirst = publicCore.createAccordionController({ items: ['one'] });
    const defaultSecond = publicCore.createAccordionController({ items: ['two'] });
    expect(defaultFirst.parts.root.getProps().id).not.toBe(defaultSecond.parts.root.getProps().id);
    defaultFirst.destroy();
    defaultSecond.destroy();
  });
});
