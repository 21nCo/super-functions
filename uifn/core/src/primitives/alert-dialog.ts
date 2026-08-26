import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnStaticOverlayPart,
} from './overlay';

export interface AlertDialogProps extends Omit<
  UIFnOverlayCommonProps,
  'modal' | 'closeOnInteractOutside' | 'closeOnOutsideInteraction' | 'trapFocus' | 'scrollLock'
> {
  onCancel?: () => void;
  onAction?: () => void;
}

export interface AlertDialogState extends UIFnOverlayBaseState {
  readonly role: 'alertdialog';
  readonly leastDestructiveFocusId: string;
}

export interface AlertDialogActions extends UIFnOverlayBaseActions {
  cancel(): void;
  action(): void;
}

export interface AlertDialogControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  portal: UIFnStaticOverlayPart;
  backdrop: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  cancel: UIFnStaticOverlayPart;
  action: UIFnStaticOverlayPart;
  close: UIFnStaticOverlayPart;
}

export type AlertDialogController = UIFnController<
  AlertDialogState,
  AlertDialogActions,
  AlertDialogControllerParts,
  AlertDialogProps
>;

export function createAlertDialogController(
  props: AlertDialogProps = {},
  env: UIFnEnvironment = {},
): AlertDialogController {
  const base = createUIFnOverlayBase({ primitive: 'AlertDialog', props, env });
  const ids = base.ids;
  const actions: AlertDialogActions = {
    ...base.actions,
    cancel() {
      props.onCancel?.();
      base.actions.close('close-cancel');
    },
    action() {
      props.onAction?.();
      base.actions.close('close-action');
    },
  };
  const data = () => overlayStateData(base.getState());
  const parts: AlertDialogControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      role: 'button', id: ids.triggerId, tabIndex: 0,
      attributes: { type: 'button' },
      aria: { haspopup: 'dialog', expanded: base.getState().open, controls: ids.contentId },
      data: data(), on: { click: () => actions.toggle() },
    }), { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'], data: ['state'], attributes: ['type'] }),
    portal: base.part('portal', () => ({ id: ids.portalId, data: data() }), { id: true, data: ['state'] }),
    backdrop: base.part('backdrop', () => ({
      id: ids.backdropId, aria: { hidden: true }, data: data(),
      hidden: !base.getState().open && !base.getState().forceMount,
    }), { id: true, aria: ['hidden'], data: ['state'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: data() }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const current = base.getState();
      return {
        role: 'alertdialog', id: ids.contentId, tabIndex: -1,
        aria: {
          modal: true,
          label: current.accessibleName ?? undefined,
          labelledby: current.accessibleName ? undefined : ids.titleId,
          describedby: ids.descriptionId,
        },
        data: data(), hidden: !current.open && !current.forceMount,
      };
    }, { role: true, id: true, tabIndex: true, aria: ['modal'], data: ['state'] }),
    title: base.part('title', () => ({ id: ids.titleId, data: data() }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: data() }), { id: true }),
    cancel: base.part('cancel', () => ({
      role: 'button', id: ids.cancelId, tabIndex: 0,
      attributes: { type: 'button' }, data: { ...data(), autofocus: 'least-destructive' },
      on: { click: () => actions.cancel() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    action: base.part('action', () => ({
      role: 'button', id: ids.actionId, tabIndex: 0,
      attributes: { type: 'button' }, data: data(), on: { click: () => actions.action() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': 'Close alert dialog' },
      data: data(), on: { click: () => actions.cancel() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
  };
  const getState = (): AlertDialogState => ({
    ...base.getState(),
    role: 'alertdialog',
    leastDestructiveFocusId: base.getState().initialFocusId ?? ids.cancelId,
  });
  return base.controller(actions, parts, getState) as AlertDialogController;
}
