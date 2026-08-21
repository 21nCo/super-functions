import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnOverlayIds,
  type UIFnOverlayPlacement,
  type UIFnStaticOverlayPart,
} from './overlay';
import type { DialogChangeReason } from './dialog';

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type PopoverAlign = 'start' | 'center' | 'end';

export interface PopoverProps extends UIFnOverlayCommonProps {
  side?: PopoverSide;
  align?: PopoverAlign;
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  collisionDetection?: boolean;
  reducedMotion?: boolean;
}

export type PopoverIds = UIFnOverlayIds;
export interface PopoverControllerState extends UIFnOverlayBaseState {
  readonly side: PopoverSide;
  readonly align: PopoverAlign;
  readonly sideOffset: number;
  readonly alignOffset: number;
  readonly collisionPadding: number;
  readonly collisionDetection: boolean;
  readonly focusTrapActive: boolean;
  readonly scrollLocked: boolean;
  readonly focusedElementId: string | null;
}
export type PopoverState = PopoverControllerState;

export interface PopoverControllerActions extends UIFnOverlayBaseActions {
  setOpen(open: boolean, reason?: DialogChangeReason): void;
  onOutsideInteraction(): boolean;
}
export type PopoverActions = PopoverControllerActions;

export interface PopoverControllerParts {
  root: UIFnStaticOverlayPart;
  anchor: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  arrow: UIFnStaticOverlayPart;
  close: UIFnStaticOverlayPart;
}

export type PopoverController = UIFnController<
  PopoverControllerState,
  PopoverControllerActions,
  PopoverControllerParts,
  PopoverProps
>;

function placement(side: PopoverSide, align: PopoverAlign): UIFnOverlayPlacement {
  return align === 'center' ? side : `${side}-${align}`;
}

function splitPlacement(value: UIFnOverlayPlacement): [PopoverSide, PopoverAlign] {
  const [side, align] = value.split('-') as [PopoverSide, PopoverAlign | undefined];
  return [side, align ?? 'center'];
}

export function createPopoverController(
  props: PopoverProps = {},
  env: UIFnEnvironment = {},
): PopoverController {
  const side = props.side ?? 'bottom';
  const align = props.align ?? 'center';
  const base = createUIFnOverlayBase({
    primitive: 'Popover',
    props: { ...props, placement: props.placement ?? placement(side, align) },
    env,
    defaultPlacement: placement(side, align),
  });
  const actions = base.actions as PopoverControllerActions;
  const ids = base.ids;
  const data = () => overlayStateData(base.getState());
  const parts: PopoverControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    anchor: base.part('anchor', () => ({ id: `${ids.rootId}-anchor`, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      role: 'button', id: ids.triggerId, tabIndex: 0,
      attributes: { type: 'button' },
      aria: { haspopup: 'dialog', expanded: base.getState().open, controls: ids.contentId },
      data: data(), on: { click: () => actions.toggle() },
    }), { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'], data: ['state'], attributes: ['type'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: data() }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const state = base.getState();
      return {
        role: 'dialog', id: ids.contentId, tabIndex: -1,
        aria: {
          modal: state.modal || undefined,
          label: state.accessibleName ?? undefined,
          labelledby: state.accessibleName ? undefined : ids.titleId,
          describedby: ids.descriptionId,
        },
        data: data(), hidden: !state.open && !state.forceMount,
      };
    }, { role: true, id: true, tabIndex: true, data: ['state'] }),
    title: base.part('title', () => ({ id: ids.titleId, data: data() }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: data() }), { id: true }),
    arrow: base.part('arrow', () => ({
      id: ids.arrowId, aria: { hidden: true }, data: data(),
    }), { id: true, aria: ['hidden'], data: ['state'] }),
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': 'Close popover' },
      data: data(), on: { click: () => actions.close('close-trigger') },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
  };
  const getState = (): PopoverControllerState => {
    const state = base.getState();
    const [currentSide, currentAlign] = splitPlacement(state.placement);
    return {
      ...state,
      side: currentSide,
      align: currentAlign,
      sideOffset: props.sideOffset ?? 5,
      alignOffset: props.alignOffset ?? 0,
      collisionPadding: props.collisionPadding ?? 8,
      collisionDetection: props.collisionDetection ?? true,
      focusTrapActive: state.open && state.trapFocus,
      scrollLocked: state.open && state.modal && state.scrollLock,
      focusedElementId: state.open ? state.initialFocusId ?? ids.contentId : null,
    };
  };
  return base.controller(actions, parts, getState) as PopoverController;
}
