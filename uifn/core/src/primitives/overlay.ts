import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnError, type UIFnError } from '../errors';
import {
  createUIFnEnvironment,
  createUIFnIdAllocator,
  type UIFnEnvironment,
} from '../environment';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps, type UIFnRequiredPartProps } from '../parts';
import type { ChangeMeta } from './shared';

export type UIFnOverlayPrimitive =
  | 'AlertDialog'
  | 'Dialog'
  | 'Drawer'
  | 'FloatingPanel'
  | 'HoverCard'
  | 'Popover'
  | 'Tooltip'
  | 'Tour';

export type UIFnOverlayPlacement =
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

export type UIFnOverlayOpenPhase = 'closed' | 'opening' | 'open' | 'closing';
export type UIFnOverlayInteraction = 'press' | 'hover-focus' | 'tour';
export type UIFnOverlayInitialFocus = 'none' | 'content' | 'first-tabbable' | 'cancel' | 'next';
export type UIFnOverlayNameRule =
  | 'title-or-aria-label-required'
  | 'trigger-owned'
  | 'tooltip-description-required';

export interface UIFnOverlayPolicy {
  readonly primitive: UIFnOverlayPrimitive;
  readonly role: 'alertdialog' | 'dialog' | 'tooltip' | 'presentation';
  readonly modalDefault: boolean;
  readonly modalConfigurable: boolean;
  readonly trapFocus: boolean;
  readonly loopFocus: boolean;
  readonly restoreFocus: boolean;
  readonly initialFocus: UIFnOverlayInitialFocus;
  readonly closeOnEscape: boolean;
  readonly closeOnPointerOutside: boolean;
  readonly closeOnFocusOutside: boolean;
  readonly preventOutsideInteraction: boolean;
  readonly interaction: UIFnOverlayInteraction;
  readonly touchOpens: boolean;
  readonly hoverableContent: boolean;
  readonly nameRule: UIFnOverlayNameRule;
  readonly portal: boolean;
  readonly presence: boolean;
  readonly position: 'none' | 'anchor' | 'target';
  readonly scrollLock: boolean;
  readonly isolateBackground: boolean;
}

function policy(value: UIFnOverlayPolicy): Readonly<UIFnOverlayPolicy> {
  return Object.freeze(value);
}

/**
 * The reviewed behavior contract for the eight overlay families.
 * These values are intentionally not normalized: an AlertDialog, Tooltip,
 * HoverCard, and movable FloatingPanel have materially different contracts.
 */
export const UIFN_OVERLAY_POLICIES = Object.freeze({
  AlertDialog: policy({
    primitive: 'AlertDialog', role: 'alertdialog', modalDefault: true,
    modalConfigurable: false, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'cancel', closeOnEscape: true, closeOnPointerOutside: false,
    closeOnFocusOutside: false, preventOutsideInteraction: true, interaction: 'press',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'none', scrollLock: true, isolateBackground: true,
  }),
  Dialog: policy({
    primitive: 'Dialog', role: 'dialog', modalDefault: true,
    modalConfigurable: true, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'first-tabbable', closeOnEscape: true, closeOnPointerOutside: true,
    closeOnFocusOutside: false, preventOutsideInteraction: false, interaction: 'press',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'none', scrollLock: true, isolateBackground: true,
  }),
  Drawer: policy({
    primitive: 'Drawer', role: 'dialog', modalDefault: true,
    modalConfigurable: true, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'first-tabbable', closeOnEscape: true, closeOnPointerOutside: true,
    closeOnFocusOutside: false, preventOutsideInteraction: false, interaction: 'press',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'none', scrollLock: true, isolateBackground: true,
  }),
  FloatingPanel: policy({
    primitive: 'FloatingPanel', role: 'dialog', modalDefault: false,
    modalConfigurable: true, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'content', closeOnEscape: true, closeOnPointerOutside: false,
    closeOnFocusOutside: false, preventOutsideInteraction: false, interaction: 'press',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'anchor', scrollLock: true, isolateBackground: true,
  }),
  HoverCard: policy({
    primitive: 'HoverCard', role: 'presentation', modalDefault: false,
    modalConfigurable: false, trapFocus: false, loopFocus: false, restoreFocus: false,
    initialFocus: 'none', closeOnEscape: true, closeOnPointerOutside: true,
    closeOnFocusOutside: true, preventOutsideInteraction: false, interaction: 'hover-focus',
    touchOpens: false, hoverableContent: true, nameRule: 'trigger-owned',
    portal: true, presence: true, position: 'anchor', scrollLock: false,
    isolateBackground: false,
  }),
  Popover: policy({
    primitive: 'Popover', role: 'dialog', modalDefault: false,
    modalConfigurable: true, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'content', closeOnEscape: true, closeOnPointerOutside: true,
    closeOnFocusOutside: true, preventOutsideInteraction: false, interaction: 'press',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'anchor', scrollLock: true, isolateBackground: true,
  }),
  Tooltip: policy({
    primitive: 'Tooltip', role: 'tooltip', modalDefault: false,
    modalConfigurable: false, trapFocus: false, loopFocus: false, restoreFocus: false,
    initialFocus: 'none', closeOnEscape: true, closeOnPointerOutside: false,
    closeOnFocusOutside: false, preventOutsideInteraction: false,
    interaction: 'hover-focus', touchOpens: false, hoverableContent: false,
    nameRule: 'tooltip-description-required', portal: true, presence: true,
    position: 'anchor', scrollLock: false, isolateBackground: false,
  }),
  Tour: policy({
    primitive: 'Tour', role: 'dialog', modalDefault: true,
    modalConfigurable: true, trapFocus: true, loopFocus: true, restoreFocus: true,
    initialFocus: 'next', closeOnEscape: true, closeOnPointerOutside: false,
    closeOnFocusOutside: false, preventOutsideInteraction: true, interaction: 'tour',
    touchOpens: true, hoverableContent: false,
    nameRule: 'title-or-aria-label-required', portal: true, presence: true,
    position: 'target', scrollLock: true, isolateBackground: true,
  }),
} satisfies Record<UIFnOverlayPrimitive, Readonly<UIFnOverlayPolicy>>);

export interface UIFnOverlayNameEvidence {
  readonly ariaLabel?: string | null;
  readonly labelledText?: readonly string[];
  readonly contentText?: string | null;
}

/** DOM-bound validation kept separate from controller construction so compound
 * title parts can mount in any framework order. */
export function assertUIFnOverlayAccessibleName(
  policyValue: Readonly<UIFnOverlayPolicy>,
  evidence: UIFnOverlayNameEvidence,
): void {
  if (policyValue.nameRule === 'trigger-owned') return;
  const ariaLabel = evidence.ariaLabel?.trim();
  const labelled = evidence.labelledText?.some((text) => !!text.trim()) ?? false;
  const text = evidence.contentText?.trim();
  const valid = policyValue.nameRule === 'tooltip-description-required'
    ? !!text
    : !!ariaLabel || labelled;
  if (valid) return;
  throw createUIFnError({
    code: 'UIFN_ACCESSIBLE_NAME_MISSING',
    package: '@uifn/core',
    component: policyValue.primitive,
    message: `${policyValue.primitive} requires a resolvable accessible name.`,
    details: { rule: policyValue.nameRule },
  });
}

export function assertUIFnAlertDialogDismissal(
  closeOnPointerOutside: boolean,
  closeOnFocusOutside: boolean,
): void {
  if (!closeOnPointerOutside && !closeOnFocusOutside) return;
  throw createUIFnError({
    code: 'UIFN_ALERT_DIALOG_DISMISSAL',
    package: '@uifn/core',
    component: 'AlertDialog',
    message: 'AlertDialog MUST NOT dismiss from outside pointer or focus interaction.',
    details: { closeOnPointerOutside, closeOnFocusOutside },
  });
}

export interface UIFnOverlayCommonProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeDetail?: (open: boolean, reason: string) => void;
  idBase?: string;
  modal?: boolean;
  closeOnEscape?: boolean;
  closeOnInteractOutside?: boolean;
  closeOnOutsideInteraction?: boolean;
  trapFocus?: boolean;
  scrollLock?: boolean;
  initialFocusId?: string;
  returnFocusId?: string;
  accessibleName?: string;
  placement?: UIFnOverlayPlacement;
  forceMount?: boolean;
}

export interface UIFnOverlayIds {
  readonly baseId: string;
  readonly rootId: string;
  readonly triggerId: string;
  readonly portalId: string;
  readonly backdropId: string;
  readonly positionerId: string;
  readonly contentId: string;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly arrowId: string;
  readonly closeId: string;
  readonly cancelId: string;
  readonly actionId: string;
}

export interface UIFnOverlayBaseState {
  readonly primitive: UIFnOverlayPrimitive;
  readonly open: boolean;
  readonly controlled: boolean;
  readonly phase: UIFnOverlayOpenPhase;
  readonly modal: boolean;
  readonly trapFocus: boolean;
  readonly scrollLock: boolean;
  readonly closeOnEscape: boolean;
  readonly closeOnInteractOutside: boolean;
  readonly policy: Readonly<UIFnOverlayPolicy>;
  readonly ids: UIFnOverlayIds;
  readonly placement: UIFnOverlayPlacement;
  readonly forceMount: boolean;
  readonly initialFocusId: string | null;
  readonly returnFocusId: string | null;
  readonly accessibleName: string | null;
  readonly pendingOpenMs: number | null;
  readonly pendingCloseMs: number | null;
  readonly pointerInsideTrigger: boolean;
  readonly pointerInsideContent: boolean;
  readonly focusInsideTrigger: boolean;
  readonly lastChangeReason: string | null;
  readonly lastError: UIFnError | null;
}

export interface UIFnOverlayBaseActions {
  setOpen(open: boolean, reason?: string): void;
  syncOpen(open: boolean): void;
  open(reason?: string): void;
  close(reason?: string): void;
  toggle(): void;
  onEscapeKeyDown(): boolean;
  onOutsideInteraction(kind?: 'pointer' | 'focus'): boolean;
  onTriggerPointerEnter(pointerType?: string): void;
  onTriggerPointerLeave(): void;
  onContentPointerEnter(pointerType?: string): void;
  onContentPointerLeave(): void;
  onTriggerFocus(): void;
  onTriggerBlur(): void;
  advanceTime(elapsedMs: number): void;
  setPresencePhase(phase: UIFnOverlayOpenPhase): void;
  setReturnFocus(focusId: string | null): void;
  setInitialFocus(focusId: string | null): void;
  reportError(error: UIFnError | null): void;
}

type OverlayStore = ReturnType<typeof createStateChannel<UIFnOverlayBaseState, boolean>>;

export interface UIFnOverlayBaseBackend<TProps extends UIFnOverlayCommonProps> {
  readonly policy: Readonly<UIFnOverlayPolicy>;
  readonly actions: UIFnOverlayBaseActions;
  readonly getState: OverlayStore['getState'];
  readonly subscribe: OverlayStore['subscribe'];
  readonly ids: UIFnOverlayIds;
  patchState(partial: Partial<UIFnOverlayBaseState>, reason?: string): void;
  part(
    name: string,
    generated: () => UIFnPartProps,
    required?: UIFnRequiredPartProps,
  ): { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
  controller<TState extends UIFnOverlayBaseState, TActions extends object, TParts extends object>(
    actions: TActions,
    parts: TParts,
    getState?: () => TState,
    updateExtra?: (inputs: Partial<TProps>) => void,
    destroyExtra?: () => void,
    normalizeInputs?: (inputs: Partial<TProps>) => Partial<TProps>,
  ): UIFnController<TState, TActions, TParts, TProps>;
}

function createOverlayIds(
  primitive: UIFnOverlayPrimitive,
  idBase: string | undefined,
  env: UIFnEnvironment,
): UIFnOverlayIds {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, primitive);
  const scope = primitive.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const token = idBase ?? resolved.generateId(scope);
  const id = (part: Exclude<keyof UIFnOverlayIds, 'baseId'>) => allocator.fromToken(`${scope}-${part.replace(/Id$/, '').toLowerCase()}`, token, part);
  const rootId = id('rootId');
  return {
    baseId: rootId, rootId, triggerId: id('triggerId'), portalId: id('portalId'),
    backdropId: id('backdropId'), positionerId: id('positionerId'),
    contentId: id('contentId'), titleId: id('titleId'),
    descriptionId: id('descriptionId'), arrowId: id('arrowId'),
    closeId: id('closeId'), cancelId: id('cancelId'), actionId: id('actionId'),
  };
}

export interface UIFnOverlayBaseOptions<TProps extends UIFnOverlayCommonProps> {
  readonly primitive: UIFnOverlayPrimitive;
  readonly props: TProps;
  readonly env?: UIFnEnvironment;
  readonly openDelay?: number;
  readonly closeDelay?: number;
  readonly defaultPlacement?: UIFnOverlayPlacement;
}

export function createUIFnOverlayBase<TProps extends UIFnOverlayCommonProps>(
  options: UIFnOverlayBaseOptions<TProps>,
): UIFnOverlayBaseBackend<TProps> {
  const { primitive, props } = options;
  let currentProps: TProps = { ...props };
  const policyValue = UIFN_OVERLAY_POLICIES[primitive];
  const ids = createOverlayIds(primitive, props.idBase, options.env ?? {});
  const controlled = createControlledValue({
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: (open) => currentProps.onOpenChange?.(open),
  });
  const initialOpen = controlled.getValue();
  const modal = policyValue.modalConfigurable ? props.modal ?? policyValue.modalDefault : policyValue.modalDefault;
  const outside = props.closeOnInteractOutside
    ?? props.closeOnOutsideInteraction
    ?? policyValue.closeOnPointerOutside;
  if (primitive === 'AlertDialog') assertUIFnAlertDialogDismissal(outside, false);
  const store = createStateChannel<UIFnOverlayBaseState, boolean>({
    primitive,
    open: initialOpen,
    controlled: controlled.isControlled(),
    phase: initialOpen ? 'open' : 'closed',
    modal,
    trapFocus: props.trapFocus ?? (modal && policyValue.trapFocus),
    scrollLock: props.scrollLock ?? (modal && policyValue.scrollLock),
    closeOnEscape: props.closeOnEscape ?? policyValue.closeOnEscape,
    closeOnInteractOutside: outside,
    policy: policyValue,
    ids,
    placement: props.placement ?? options.defaultPlacement ?? 'bottom',
    forceMount: props.forceMount ?? false,
    initialFocusId: props.initialFocusId ?? null,
    returnFocusId: props.returnFocusId ?? null,
    accessibleName: props.accessibleName?.trim() || null,
    pendingOpenMs: null,
    pendingCloseMs: null,
    pointerInsideTrigger: false,
    pointerInsideContent: false,
    focusInsideTrigger: false,
    lastChangeReason: null,
    lastError: null,
  });

  const publish = (
    requestedOpen: boolean,
    reason: string,
    source: ChangeMeta<boolean>['source'],
    inputModality?: ChangeMeta<boolean>['inputModality'],
  ) => {
    const previous = store.getState();
    const result = source === 'controlled-sync'
      ? controlled.syncValue(requestedOpen)
      : controlled.requestValue(requestedOpen);
    const committed = result.value;
    const meta: ChangeMeta<boolean> = {
      source,
      reason,
      previousValue: previous.open,
      nextValue: requestedOpen,
      inputModality,
    };
    const next: UIFnOverlayBaseState = {
      ...previous,
      open: committed,
      phase: committed ? 'open' : 'closed',
      pendingOpenMs: null,
      pendingCloseMs: null,
      lastChangeReason: reason,
      lastError: null,
    };
    const semanticChanged = previous.open !== next.open
      || previous.pendingOpenMs !== null
      || previous.pendingCloseMs !== null
      || previous.lastChangeReason !== reason;
    if (semanticChanged) store.setState(next, meta);
    if (source !== 'controlled-sync') currentProps.onOpenChangeDetail?.(requestedOpen, reason);
  };

  const scheduleOpen = (reason: string, modality: 'pointer' | 'keyboard') => {
    const state = store.getState();
    const delay = Math.max(0, options.openDelay ?? 0);
    if (delay === 0) {
      publish(true, reason, 'user', modality);
      return;
    }
    store.patchState({ pendingOpenMs: delay, pendingCloseMs: null, lastChangeReason: reason });
  };
  const scheduleClose = (reason: string, modality: 'pointer' | 'keyboard') => {
    const state = store.getState();
    const shouldRemain = state.focusInsideTrigger
      || state.pointerInsideTrigger
      || (policyValue.hoverableContent && state.pointerInsideContent);
    if (shouldRemain) return;
    const delay = Math.max(0, options.closeDelay ?? 0);
    if (delay === 0) {
      publish(false, reason, 'user', modality);
      return;
    }
    store.patchState({ pendingOpenMs: null, pendingCloseMs: delay, lastChangeReason: reason });
  };

  const actions: UIFnOverlayBaseActions = {
    setOpen(next, reason = next ? 'open-programmatic' : 'close-programmatic') {
      publish(next, reason, 'programmatic');
    },
    syncOpen(next) {
      publish(next, next ? 'open-controlled-sync' : 'close-controlled-sync', 'controlled-sync');
    },
    open(reason = 'open-programmatic') { publish(true, reason, 'programmatic'); },
    close(reason = 'close-programmatic') { publish(false, reason, 'programmatic'); },
    toggle() {
      const state = store.getState();
      publish(!state.open, state.open ? 'close-trigger' : 'open-trigger', 'user', 'pointer');
    },
    onEscapeKeyDown() {
      const state = store.getState();
      if (!state.open || !state.closeOnEscape) return false;
      publish(false, 'close-escape', 'user', 'keyboard');
      return true;
    },
    onOutsideInteraction(kind = 'pointer') {
      const state = store.getState();
      const permitted = kind === 'focus'
        ? policyValue.closeOnFocusOutside && state.closeOnInteractOutside
        : policyValue.closeOnPointerOutside && state.closeOnInteractOutside;
      if (!state.open || !permitted) {
        if (primitive === 'AlertDialog' && state.open) {
          store.patchState({
            lastError: createUIFnError({
              code: 'UIFN_ALERT_DIALOG_DISMISSAL', package: '@uifn/core',
              component: primitive, recoverable: true,
              message: 'AlertDialog outside interaction was blocked by policy.',
            }),
          });
        }
        return false;
      }
      publish(false, kind === 'focus' ? 'close-focus-outside' : 'close-pointer-outside', 'user', kind === 'focus' ? 'keyboard' : 'pointer');
      return true;
    },
    onTriggerPointerEnter(pointerType = 'mouse') {
      if (pointerType === 'touch' && !policyValue.touchOpens) return;
      store.patchState({ pointerInsideTrigger: true, pendingCloseMs: null });
      if (policyValue.interaction === 'hover-focus') scheduleOpen('open-hover', 'pointer');
    },
    onTriggerPointerLeave() {
      store.patchState({ pointerInsideTrigger: false });
      if (policyValue.interaction === 'hover-focus') scheduleClose('close-hover', 'pointer');
    },
    onContentPointerEnter(pointerType = 'mouse') {
      if (pointerType === 'touch' && !policyValue.touchOpens) return;
      store.patchState({ pointerInsideContent: true, pendingCloseMs: null });
    },
    onContentPointerLeave() {
      store.patchState({ pointerInsideContent: false });
      if (policyValue.interaction === 'hover-focus') scheduleClose('close-hover', 'pointer');
    },
    onTriggerFocus() {
      store.patchState({ focusInsideTrigger: true, pendingCloseMs: null });
      if (policyValue.interaction === 'hover-focus') publish(true, 'open-focus', 'user', 'keyboard');
    },
    onTriggerBlur() {
      store.patchState({ focusInsideTrigger: false });
      if (policyValue.interaction === 'hover-focus') publish(false, 'close-blur', 'user', 'keyboard');
    },
    advanceTime(elapsedMs) {
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
      const state = store.getState();
      if (state.pendingOpenMs !== null) {
        const remaining = Math.max(0, state.pendingOpenMs - elapsedMs);
        if (remaining === 0) publish(true, state.lastChangeReason ?? 'open-delay', 'user', 'pointer');
        else store.patchState({ pendingOpenMs: remaining });
        return;
      }
      if (state.pendingCloseMs !== null) {
        const remaining = Math.max(0, state.pendingCloseMs - elapsedMs);
        if (remaining === 0) publish(false, state.lastChangeReason ?? 'close-delay', 'user', 'pointer');
        else store.patchState({ pendingCloseMs: remaining });
      }
    },
    setPresencePhase(phase) { store.patchState({ phase }); },
    setReturnFocus(returnFocusId) { store.patchState({ returnFocusId }); },
    setInitialFocus(initialFocusId) { store.patchState({ initialFocusId }); },
    reportError(lastError) { store.patchState({ lastError }); },
  };

  return {
    policy: policyValue,
    actions,
    getState: store.getState,
    subscribe: store.subscribe,
    ids,
    patchState(partial, reason = 'overlay-state-change') {
      const current = store.getState();
      store.patchState(partial, {
        source: 'programmatic',
        reason,
        previousValue: current.open,
        nextValue: current.open,
      });
    },
    part(name, generated, required) {
      return {
        name,
        getProps(userProps) {
          return mergePartProps(generated(), userProps, {
            component: primitive,
            part: name,
            required,
          });
        },
      };
    },
    controller(actionsValue, parts, getState = store.getState as () => any, updateExtra, destroyExtra, normalizeInputs) {
      return createUIFnController({
        actions: actionsValue,
        parts,
        getState,
        update(inputs) {
          const normalizedInputs = normalizeInputs?.(inputs) ?? inputs;
          const candidateProps = { ...currentProps, ...normalizedInputs };
          const nextModal = policyValue.modalConfigurable
            ? candidateProps.modal ?? policyValue.modalDefault
            : policyValue.modalDefault;
          const nextOutside = candidateProps.closeOnInteractOutside
            ?? candidateProps.closeOnOutsideInteraction
            ?? policyValue.closeOnPointerOutside;
          if (primitive === 'AlertDialog') assertUIFnAlertDialogDismissal(nextOutside, false);
          currentProps = candidateProps;
          store.patchState({
            modal: nextModal,
            trapFocus: currentProps.trapFocus ?? (nextModal && policyValue.trapFocus),
            scrollLock: currentProps.scrollLock ?? (nextModal && policyValue.scrollLock),
            closeOnEscape: currentProps.closeOnEscape ?? policyValue.closeOnEscape,
            closeOnInteractOutside: nextOutside,
            placement: currentProps.placement ?? options.defaultPlacement ?? 'bottom',
            forceMount: currentProps.forceMount ?? false,
            initialFocusId: currentProps.initialFocusId ?? null,
            returnFocusId: currentProps.returnFocusId ?? null,
            accessibleName: currentProps.accessibleName?.trim() || null,
          }, {
            source: 'controlled-sync',
            reason: 'overlay-inputs-synced',
            previousValue: store.getState().open,
            nextValue: store.getState().open,
          });
          if ('open' in normalizedInputs && normalizedInputs.open !== undefined) actions.syncOpen(normalizedInputs.open);
          updateExtra?.(normalizedInputs);
        },
        subscribe(subscriber) {
          return store.subscribe((_state, meta) => subscriber(getState(), meta as any));
        },
        destroy() {
          destroyExtra?.();
          controlled.destroy();
          store.destroy();
        },
      });
    },
  };
}

export type UIFnStaticOverlayPart = {
  readonly name: string;
  getProps(userProps?: UIFnPartProps): UIFnPartProps;
};

export function overlayStateData(state: UIFnOverlayBaseState): Record<string, string | boolean> {
  return {
    state: state.phase,
    open: state.open,
    modal: state.modal,
    placement: state.placement,
  };
}
