import { createUIFnController, type UIFnController } from '../controller';
import {
  createUIFnEnvironment,
  createUIFnIdAllocator,
  normalizeUIFnIdToken,
  type UIFnEnvironment,
} from '../environment';
import { mergePartProps, type UIFnPartProps, type UIFnRequiredPartProps } from '../parts';
import { focusUIFnPart } from '../internal/runtime/focus';
import {
  createAccordionRuntime,
  type AccordionActions,
  type AccordionProps,
  type AccordionState,
} from './accordion';
import { createCollapsibleRuntime, type CollapsibleActions, type CollapsibleProps, type CollapsibleState } from './collapsible';
import { createScrollAreaRuntime, type ScrollAreaActions, type ScrollAreaProps, type ScrollAreaState } from './scroll-area';
import { createSwitchRuntime, type SwitchActions, type SwitchProps, type SwitchState } from './switch';
import { createToolbarRuntime, type ToolbarActions, type ToolbarProps, type ToolbarState } from './toolbar';

type StaticPart = {
  name: string;
  getProps: (userProps?: UIFnPartProps) => UIFnPartProps;
};

type ValuePart = {
  name: string;
  getProps: (value: string, userProps?: UIFnPartProps) => UIFnPartProps;
};

type Axis = 'vertical' | 'horizontal';

type AxisPart = {
  name: string;
  getProps: (axis: Axis, userProps?: UIFnPartProps) => UIFnPartProps;
};

type RuntimeBackend<TState, TActions extends object, TMeta = unknown> = {
  readonly state: TState;
  readonly actions: TActions;
  getState: () => TState;
  subscribe: (callback: (state: TState, meta?: TMeta) => void) => () => void;
};

interface ControllerIdSet<TSlot extends string> {
  token: string;
  ids: Record<TSlot, string>;
}

function createControllerIds<TSlot extends string>(
  component: string,
  scope: string,
  slots: readonly TSlot[],
  env: UIFnEnvironment = {}
): ControllerIdSet<TSlot> {
  const resolvedEnv = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolvedEnv, component);
  const token = resolvedEnv.generateId(scope);
  const ids = Object.fromEntries(
    slots.map((slot) => [
      slot,
      allocator.fromToken(`${scope}-${slot}`, token, slot),
    ])
  ) as Record<TSlot, string>;

  return { token, ids };
}

function itemId(rootId: string, part: string, value: string | number): string {
  const segment = normalizeUIFnIdToken(String(value)) || 'item';
  return `${rootId}-${part}-${segment}`;
}

function staticPart(
  component: string,
  name: string,
  getGeneratedProps: () => UIFnPartProps,
  required?: UIFnRequiredPartProps
): StaticPart {
  return {
    name,
    getProps(userProps) {
      return mergePartProps(getGeneratedProps(), userProps, {
        component,
        part: name,
        required,
      });
    },
  };
}

function createControllerFromRuntime<TState, TActions extends object, TParts extends object, TMeta = unknown>(
  model: RuntimeBackend<TState, TActions, TMeta>,
  parts: TParts,
  update: (inputs: Partial<Record<string, unknown>>) => void = () => undefined,
  destroy?: () => void,
): UIFnController<TState, TActions, TParts, Record<string, unknown>> {
  return createUIFnController({
    actions: model.actions,
    parts,
    getState: model.getState,
    update,
    subscribe: model.subscribe,
    destroy: destroy ?? (() => {
      (model as RuntimeBackend<TState, TActions, TMeta> & { destroy?: () => void }).destroy?.();
    }),
  });
}

function openState(open: boolean): 'open' | 'closed' {
  return open ? 'open' : 'closed';
}

function booleanState(active: boolean): 'active' | 'inactive' {
  return active ? 'active' : 'inactive';
}

function checkedState(checked: boolean): 'checked' | 'unchecked' {
  return checked ? 'checked' : 'unchecked';
}

function keyFromEvent(userKey: string | undefined): string {
  return userKey ?? '';
}

export interface AccordionControllerParts {
  root: StaticPart;
  item: ValuePart;
  header: ValuePart;
  trigger: ValuePart;
  content: ValuePart;
  indicator: ValuePart;
}

export type AccordionController = UIFnController<AccordionState, AccordionActions, AccordionControllerParts, AccordionProps>;

export function createAccordionController(
  props: AccordionProps = {},
  env: UIFnEnvironment = {}
): AccordionController {
  const machine = createAccordionRuntime(props);
  const { ids } = createControllerIds('Accordion', 'accordion', ['root'] as const, env);
  const isOpen = (value: string) => {
    const currentValue = machine.getState().value;
    return Array.isArray(currentValue) ? currentValue.includes(value) : currentValue === value;
  };
  const getTriggerId = (value: string) => itemId(ids.root, 'trigger', value);
  const getContentId = (value: string) => itemId(ids.root, 'content', value);

  const parts: AccordionControllerParts = {
    root: staticPart(
      'Accordion',
      'root',
      () => {
        const state = machine.getState();
        return {
          id: ids.root,
          data: {
            orientation: state.orientation,
            disabled: state.disabled,
            type: state.type,
          },
        };
      },
      { id: true, data: ['orientation'] }
    ),
    item: {
      name: 'item',
      getProps(value, userProps) {
        const state = machine.getState();
        return mergePartProps(
          {
            id: itemId(ids.root, 'item', value),
            data: {
              state: openState(isOpen(value)),
              disabled: state.disabled,
              value,
            },
          },
          userProps,
          {
            component: 'Accordion',
            part: 'item',
            required: { id: true, data: ['state'] },
          }
        );
      },
    },
    header: {
      name: 'header',
      getProps(value, userProps) {
        return mergePartProps(
          {
            role: 'heading',
            id: itemId(ids.root, 'header', value),
            aria: { level: 2 },
            data: { value },
          },
          userProps,
          {
            component: 'Accordion',
            part: 'header',
            required: { role: true, id: true, aria: ['level'] },
          }
        );
      },
    },
    trigger: {
      name: 'trigger',
      getProps(value, userProps) {
        const state = machine.getState();
        const open = isOpen(value);
        return mergePartProps(
          {
            role: 'button',
            id: getTriggerId(value),
            attributes: { type: 'button' },
            tabIndex: state.focusedItem === value ? 0 : -1,
            aria: {
              expanded: open,
              controls: getContentId(value),
              disabled: state.disabled,
            },
            data: {
              state: openState(open),
              disabled: state.disabled,
              orientation: state.orientation,
              value,
            },
            disabled: state.disabled,
            on: {
              click: () => machine.actions.toggleItem(value),
              keydown: (event) => {
                const next = machine.actions.handleKeyDown(keyFromEvent(event?.key), value);
                if (next && next !== value) {
                  focusUIFnPart(event, [itemId(ids.root, 'button', next), itemId(ids.root, 'link', next)]);
                }
              },
            },
          },
          userProps,
          {
            component: 'Accordion',
            part: 'trigger',
            required: { role: true, id: true, tabIndex: true, aria: ['expanded', 'controls'], data: ['state'] },
          }
        );
      },
    },
    content: {
      name: 'content',
      getProps(value, userProps) {
        const open = isOpen(value);
        const useRegion = machine.getState().items.length <= 6;
        return mergePartProps(
          {
            role: useRegion ? 'region' : undefined,
            id: getContentId(value),
            aria: {
              labelledby: getTriggerId(value),
            },
            data: {
              state: openState(open),
              value,
            },
            hidden: !open,
          },
          userProps,
          {
            component: 'Accordion',
            part: 'content',
            required: { id: true, aria: ['labelledby'], data: ['state'] },
          }
        );
      },
    },
    indicator: {
      name: 'indicator',
      getProps(value, userProps) {
        return mergePartProps(
          {
            role: 'presentation',
            id: itemId(ids.root, 'indicator', value),
            aria: { hidden: true },
            data: {
              state: openState(isOpen(value)),
              value,
            },
          },
          userProps,
          {
            component: 'Accordion',
            part: 'indicator',
            required: { id: true, data: ['state'] },
          }
        );
      },
    },
  };

  return createControllerFromRuntime(machine, parts, (inputs) => {
    const items = inputs.items as AccordionProps['items'];
    if (items !== undefined) machine.actions.setItems(items);
    const value = inputs.value as AccordionProps['value'];
    if (value !== undefined) machine.actions.syncValue(value);
  });
}

export interface CollapsibleControllerParts {
  root: StaticPart;
  trigger: StaticPart;
  content: StaticPart;
}

export type CollapsibleController = UIFnController<CollapsibleState, CollapsibleActions, CollapsibleControllerParts, CollapsibleProps>;

export function createCollapsibleController(
  props: CollapsibleProps = {},
  env: UIFnEnvironment = {}
): CollapsibleController {
  const machine = createCollapsibleRuntime(props);
  const { ids } = createControllerIds('Collapsible', 'collapsible', ['root', 'trigger', 'content'] as const, env);
  const parts: CollapsibleControllerParts = {
    root: staticPart(
      'Collapsible',
      'root',
      () => ({
        role: 'presentation',
        id: ids.root,
        data: {
          state: openState(machine.getState().open),
          disabled: machine.getState().disabled,
        },
      }),
      { id: true, data: ['state'] }
    ),
    trigger: staticPart(
      'Collapsible',
      'trigger',
      () => {
        const state = machine.getState();
        return {
          role: 'button',
          id: ids.trigger,
          attributes: { type: 'button' },
          tabIndex: state.disabled ? -1 : 0,
          aria: {
            expanded: state.open,
            controls: ids.content,
            disabled: state.disabled,
          },
          data: {
            state: openState(state.open),
            disabled: state.disabled,
          },
          disabled: state.disabled,
          on: {
            click: () => machine.actions.toggle(),
          },
        };
      },
      { role: true, id: true, tabIndex: true, aria: ['expanded', 'controls'], data: ['state'] }
    ),
    content: staticPart(
      'Collapsible',
      'content',
      () => ({
        role: 'region',
        id: ids.content,
        aria: {
          labelledby: ids.trigger,
        },
        data: {
          state: openState(machine.getState().open),
        },
        hidden: !machine.getState().open,
      }),
      { role: true, id: true, aria: ['labelledby'], data: ['state'] }
    ),
  };

  return createControllerFromRuntime(machine, parts, (inputs) => {
    const open = inputs.open as CollapsibleProps['open'];
    if (open !== undefined) machine.actions.syncOpen(open);
  });
}

export interface ScrollAreaControllerParts {
  root: StaticPart;
  viewport: StaticPart;
  content: StaticPart;
  scrollbar: AxisPart;
  thumb: AxisPart;
  corner: StaticPart;
}

export type ScrollAreaController = UIFnController<ScrollAreaState, ScrollAreaActions, ScrollAreaControllerParts, ScrollAreaProps>;

export function createScrollAreaController(
  props: ScrollAreaProps = {},
  env: UIFnEnvironment = {}
): ScrollAreaController {
  const machine = createScrollAreaRuntime(props);
  const { ids } = createControllerIds('ScrollArea', 'scroll-area', ['root', 'viewport', 'content', 'corner'] as const, env);
  const axisState = (axis: Axis) => (axis === 'vertical' ? machine.getState().vertical : machine.getState().horizontal);
  const parts: ScrollAreaControllerParts = {
    root: staticPart(
      'ScrollArea',
      'root',
      () => ({
        role: 'presentation',
        id: ids.root,
        data: {
          type: machine.getState().type,
          corner: machine.getState().cornerVisible,
        },
      }),
      { id: true, data: ['type'] }
    ),
    viewport: staticPart(
      'ScrollArea',
      'viewport',
      () => ({
        role: 'region',
        id: ids.viewport,
        tabIndex: 0,
        data: {
          state: machine.getState().status,
          type: machine.getState().type,
        },
        aria: { label: props.ariaLabel ?? 'Scrollable content' },
      }),
      { role: true, id: true, tabIndex: true, aria: ['label'], data: ['state'] }
    ),
    content: staticPart(
      'ScrollArea',
      'content',
      () => ({
        role: 'presentation',
        id: ids.content,
        data: { state: machine.getState().status },
      }),
      { id: true, data: ['state'] }
    ),
    scrollbar: {
      name: 'scrollbar',
      getProps(axis, userProps) {
        const state = axisState(axis);
        const enabled = machine.getState().orientation === 'both' || machine.getState().orientation === axis;
        return mergePartProps(
          {
            role: 'scrollbar',
            id: itemId(ids.root, 'scrollbar', axis),
            tabIndex: state.visible ? 0 : -1,
            aria: {
              orientation: axis,
              controls: ids.viewport,
              valuemin: 0,
              valuemax: 100,
              valuenow: Math.round(state.thumbPositionPercent),
              label: `${axis} scroll position`,
            },
            data: {
              orientation: axis,
              state: state.visible ? 'visible' : 'hidden',
            },
            hidden: !state.visible || !enabled,
            on: { keydown: (event) => machine.actions.handleKeyDown(axis, keyFromEvent(event?.key)) },
          },
          userProps,
          {
            component: 'ScrollArea',
            part: 'scrollbar',
            required: { role: true, id: true, tabIndex: true, aria: ['orientation', 'controls', 'valuemin', 'valuemax', 'valuenow', 'label'], data: ['state'] },
          }
        );
      },
    },
    thumb: {
      name: 'thumb',
      getProps(axis, userProps) {
        const state = axisState(axis);
        return mergePartProps(
          {
            role: 'presentation',
            id: itemId(ids.root, 'thumb', axis),
            data: {
              orientation: axis,
              state: state.visible ? 'visible' : 'hidden',
            },
            style:
              axis === 'vertical'
                ? { height: `${state.thumbSizePercent}%`, transform: `translateY(${state.thumbPositionPercent}%)` }
                : { width: `${state.thumbSizePercent}%`, transform: `translateX(${state.thumbPositionPercent}%)` },
            hidden: !state.visible,
          },
          userProps,
          { component: 'ScrollArea', part: 'thumb', required: { id: true, data: ['state'] } }
        );
      },
    },
    corner: staticPart(
      'ScrollArea',
      'corner',
      () => ({
        role: 'presentation',
        id: ids.corner,
        data: {
          state: machine.getState().cornerVisible ? 'visible' : 'hidden',
        },
        hidden: !machine.getState().cornerVisible,
      }),
      { id: true, data: ['state'] }
    ),
  };

  return createControllerFromRuntime(machine, parts, () => undefined);
}

export interface SwitchControllerParts {
  root: StaticPart;
  control: StaticPart;
  thumb: StaticPart;
  label: StaticPart;
  hiddenInput: StaticPart;
}

export type SwitchController = UIFnController<SwitchState, SwitchActions, SwitchControllerParts, SwitchProps>;

export function createSwitchController(
  props: SwitchProps = {},
  env: UIFnEnvironment = {}
): SwitchController {
  const machine = createSwitchRuntime(props);
  const { ids } = createControllerIds('Switch', 'switch', ['root', 'control', 'thumb', 'label', 'hidden-input'] as const, env);
  const parts: SwitchControllerParts = {
    root: staticPart(
      'Switch',
      'root',
      () => ({
        id: ids.root,
        data: {
          state: checkedState(machine.getState().checked),
          disabled: machine.getState().disabled,
        },
      }),
      { id: true, data: ['state'] }
    ),
    control: staticPart(
      'Switch',
      'control',
      () => {
        const state = machine.getState();
        return {
          role: 'switch',
          id: ids.control,
          attributes: { type: 'button' },
          tabIndex: state.disabled ? -1 : 0,
          aria: {
            checked: state.ariaChecked,
            disabled: state.disabled,
            required: state.required,
          },
          data: {
            state: checkedState(state.checked),
            disabled: state.disabled,
          },
          disabled: state.disabled,
          on: {
            click: () => machine.actions.toggle(),
            keydown: (event) => machine.actions.handleKeyDown(keyFromEvent(event?.key)),
          },
        };
      },
      { role: true, id: true, tabIndex: true, aria: ['checked'], data: ['state'] }
    ),
    thumb: staticPart(
      'Switch',
      'thumb',
      () => ({
        role: 'presentation',
        id: ids.thumb,
        data: {
          state: checkedState(machine.getState().checked),
          disabled: machine.getState().disabled,
        },
      }),
      { id: true, data: ['state'] }
    ),
    label: staticPart(
      'Switch',
      'label',
      () => ({
        id: ids.label,
        attributes: { for: ids.control },
        data: { disabled: machine.getState().disabled },
      }),
      { id: true }
    ),
    hiddenInput: staticPart(
      'Switch',
      'hiddenInput',
      () => ({
        id: ids['hidden-input'],
        hidden: true,
        attributes: {
          type: 'checkbox',
          name: machine.getState().name,
          value: machine.getState().value,
          checked: machine.getState().checked,
          required: machine.getState().required,
          disabled: machine.getState().disabled,
        },
        data: {
          state: checkedState(machine.getState().checked),
        },
        on: {
          change: () => machine.actions.toggle(),
        },
      }),
      { id: true, data: ['state'] }
    ),
  };

  return createControllerFromRuntime(machine, parts, (inputs) => {
    const checked = inputs.checked as SwitchProps['checked'];
    if (checked !== undefined) machine.actions.syncChecked(checked);
  });
}

export interface ToolbarControllerParts {
  root: StaticPart;
  button: ValuePart;
  link: ValuePart;
  toggleGroup: ValuePart;
  separator: ValuePart;
}

export type ToolbarController = UIFnController<ToolbarState, ToolbarActions, ToolbarControllerParts, ToolbarProps>;

export function createToolbarController(
  props: ToolbarProps = {},
  env: UIFnEnvironment = {}
): ToolbarController {
  const machine = createToolbarRuntime(props);
  const { ids } = createControllerIds('Toolbar', 'toolbar', ['root', 'separator'] as const, env);
  const parts: ToolbarControllerParts = {
    root: staticPart(
      'Toolbar',
      'root',
      () => {
        const state = machine.getState();
        return {
          role: 'toolbar',
          id: ids.root,
          aria: {
            orientation: state.orientation,
            label: props.ariaLabel ?? 'Toolbar',
          },
          data: {
            orientation: state.orientation,
          },
        };
      },
      { role: true, id: true, aria: ['orientation', 'label'], data: ['orientation'] }
    ),
    button: {
      name: 'button',
      getProps(value, userProps) {
        const state = machine.getState();
        const item = state.items.find((entry) => entry.id === value);
        const disabled = item?.disabled ?? false;
        return mergePartProps(
          {
            role: 'button',
            id: itemId(ids.root, 'button', value),
            attributes: { type: 'button' },
            tabIndex: state.focusedItem === value ? 0 : -1,
            aria: {
              disabled,
            },
            data: {
              state: state.focusedItem === value ? 'active' : 'inactive',
              disabled,
              value,
            },
            disabled,
            on: {
              focus: () => machine.actions.focusItem(value),
              keydown: (event) => {
                const next = machine.actions.handleKeyDown(keyFromEvent(event?.key), value);
                if (next && next !== value) {
                  focusUIFnPart(event, [itemId(ids.root, 'button', next), itemId(ids.root, 'link', next)]);
                }
              },
            },
          },
          userProps,
          {
            component: 'Toolbar',
            part: 'button',
            required: { role: true, id: true, tabIndex: true, data: ['state'] },
          }
        );
      },
    },
    link: {
      name: 'link',
      getProps(value, userProps) {
        const state = machine.getState();
        const item = state.items.find((entry) => entry.id === value);
        const disabled = item?.disabled ?? false;
        return mergePartProps(
          {
            id: itemId(ids.root, 'link', value),
            tabIndex: state.focusedItem === value ? 0 : -1,
            aria: { disabled },
            data: {
              state: state.focusedItem === value ? 'active' : 'inactive',
              disabled,
              value,
            },
            on: {
              focus: () => machine.actions.focusItem(value),
              keydown: (event) => machine.actions.handleKeyDown(keyFromEvent(event?.key), value),
            },
          },
          userProps,
          {
            component: 'Toolbar',
            part: 'link',
            required: { id: true, tabIndex: true, data: ['state'] },
          }
        );
      },
    },
    toggleGroup: {
      name: 'toggleGroup',
      getProps(value, userProps) {
        return mergePartProps(
          {
            role: 'group',
            id: itemId(ids.root, 'toggle-group', value),
            data: { value },
          },
          userProps,
          { component: 'Toolbar', part: 'toggleGroup', required: { role: true, id: true } }
        );
      },
    },
    separator: {
      name: 'separator',
      getProps(value, userProps) {
        return mergePartProps({
        role: 'separator',
        id: itemId(ids.root, 'separator', value),
        aria: {
          orientation: machine.getState().orientation === 'horizontal' ? 'vertical' : 'horizontal',
        },
        data: {
          orientation: machine.getState().orientation === 'horizontal' ? 'vertical' : 'horizontal',
        },
        }, userProps, {
          component: 'Toolbar',
          part: 'separator',
          required: { role: true, id: true, aria: ['orientation'], data: ['orientation'] },
        });
      },
    },
  };

  return createControllerFromRuntime(machine, parts, (inputs) => {
    const items = inputs.items as ToolbarProps['items'];
    if (items !== undefined) machine.actions.setItems(items);
  });
}
