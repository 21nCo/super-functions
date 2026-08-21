import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnOverlayIds,
  type UIFnStaticOverlayPart,
} from './overlay';

export type DialogOpenReason = 'open-trigger' | 'open-programmatic' | 'open-controlled-sync';
export type DialogCloseReason =
  | 'close-escape'
  | 'close-outside-click'
  | 'close-pointer-outside'
  | 'close-focus-outside'
  | 'close-trigger'
  | 'close-programmatic'
  | 'close-controlled-sync';
export type DialogChangeReason = DialogOpenReason | DialogCloseReason;

export interface DialogProps extends UIFnOverlayCommonProps {
  outsideInteractionBehavior?: 'close' | 'ignore' | 'disallow';
  role?: 'dialog' | 'alertdialog';
}

export type DialogIds = UIFnOverlayIds;

export interface DialogControllerState extends UIFnOverlayBaseState {
  readonly role: 'dialog' | 'alertdialog';
  readonly closeOnOutsideInteraction: boolean;
  readonly outsideInteractionBehavior: 'close' | 'ignore' | 'disallow';
  readonly focusTrapActive: boolean;
  readonly scrollLocked: boolean;
  readonly focusedElementId: string | null;
}

export type DialogState = DialogControllerState;

export interface DialogControllerActions extends UIFnOverlayBaseActions {
  setOpen(open: boolean, reason?: DialogChangeReason): void;
  open(reason?: DialogOpenReason): void;
  close(reason?: DialogCloseReason): void;
  onOutsideInteraction(): boolean;
}

export type DialogActions = DialogControllerActions;

export interface DialogControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  portal: UIFnStaticOverlayPart;
  backdrop: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  close: UIFnStaticOverlayPart;
}

export type DialogController = UIFnController<
  DialogControllerState,
  DialogControllerActions,
  DialogControllerParts,
  DialogProps
>;

function dialogState(
  state: UIFnOverlayBaseState,
  behavior: 'close' | 'ignore' | 'disallow',
): DialogControllerState {
  return {
    ...state,
    role: state.policy.role === 'alertdialog' ? 'alertdialog' : 'dialog',
    closeOnOutsideInteraction: behavior === 'close',
    outsideInteractionBehavior: behavior,
    focusTrapActive: state.open && state.trapFocus,
    scrollLocked: state.open && state.modal && state.scrollLock,
    focusedElementId: state.open ? state.initialFocusId ?? state.ids.contentId : null,
  };
}

export function createDialogController(
  props: DialogProps = {},
  env: UIFnEnvironment = {},
): DialogController {
  const isAlert = props.role === 'alertdialog';
  const behavior = props.outsideInteractionBehavior
    ?? ((props.closeOnInteractOutside ?? props.closeOnOutsideInteraction) === false ? 'ignore' : 'close');
  const normalized: DialogProps = {
    ...props,
    closeOnInteractOutside: behavior === 'close',
  };
  const base = createUIFnOverlayBase({
    primitive: isAlert ? 'AlertDialog' : 'Dialog',
    props: normalized,
    env,
  });
  const actions = base.actions as DialogControllerActions;
  const state = () => dialogState(base.getState(), behavior);
  const ids = base.ids;
  const component = isAlert ? 'AlertDialog' : 'Dialog';
  const parts: DialogControllerParts = {
    root: base.part('root', () => ({
      id: ids.rootId,
      data: overlayStateData(base.getState()),
    }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      role: 'button', id: ids.triggerId, tabIndex: 0,
      attributes: { type: 'button' },
      aria: { haspopup: 'dialog', expanded: base.getState().open, controls: ids.contentId },
      data: overlayStateData(base.getState()),
      on: { click: () => actions.toggle() },
    }), { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'], data: ['state'], attributes: ['type'] }),
    portal: base.part('portal', () => ({ id: ids.portalId, data: overlayStateData(base.getState()) }), { id: true, data: ['state'] }),
    backdrop: base.part('backdrop', () => ({
      id: ids.backdropId,
      aria: { hidden: true },
      data: overlayStateData(base.getState()),
      hidden: !base.getState().open && !base.getState().forceMount,
    }), { id: true, aria: ['hidden'], data: ['state'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: overlayStateData(base.getState()) }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const current = base.getState();
      return {
        role: isAlert ? 'alertdialog' : 'dialog',
        id: ids.contentId,
        tabIndex: -1,
        aria: {
          modal: current.modal || undefined,
          label: current.accessibleName ?? undefined,
          labelledby: current.accessibleName ? undefined : ids.titleId,
          describedby: ids.descriptionId,
        },
        data: overlayStateData(current),
        hidden: !current.open && !current.forceMount,
      };
    }, { role: true, id: true, tabIndex: true, data: ['state'] }),
    title: base.part('title', () => ({ id: ids.titleId, data: overlayStateData(base.getState()) }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: overlayStateData(base.getState()) }), { id: true }),
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': `Close ${component}` },
      data: overlayStateData(base.getState()),
      on: { click: () => actions.close('close-trigger') },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
  };
  return base.controller(actions, parts, state) as DialogController;
}
