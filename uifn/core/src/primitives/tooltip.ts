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

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

export interface TooltipProps extends UIFnOverlayCommonProps {
  delayDuration?: number;
  openDelay?: number;
  closeDelay?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
  disabled?: boolean;
  side?: TooltipSide;
  align?: TooltipAlign;
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  collisionDetection?: boolean;
  reducedMotion?: boolean;
}

export type TooltipControllerIds = UIFnOverlayIds;
export interface TooltipControllerState extends UIFnOverlayBaseState {
  readonly delayDuration: number;
  readonly openDelay: number;
  readonly closeDelay: number;
  readonly skipDelayDuration: number;
  readonly disableHoverableContent: boolean;
  readonly disabled: boolean;
  readonly side: TooltipSide;
  readonly align: TooltipAlign;
  readonly sideOffset: number;
  readonly alignOffset: number;
  readonly collisionPadding: number;
  readonly collisionDetection: boolean;
}
export type TooltipState = TooltipControllerState;

export interface TooltipControllerActions extends UIFnOverlayBaseActions {
  openWithDelay(): void;
  close(): void;
}
export type TooltipActions = TooltipControllerActions;

export interface TooltipControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  arrow: UIFnStaticOverlayPart;
}

export type TooltipController = UIFnController<
  TooltipControllerState,
  TooltipControllerActions,
  TooltipControllerParts,
  TooltipProps
>;

function placement(side: TooltipSide, align: TooltipAlign): UIFnOverlayPlacement {
  return align === 'center' ? side : `${side}-${align}`;
}

export function createTooltipController(
  props: TooltipProps = {},
  env: UIFnEnvironment = {},
): TooltipController {
  const side = props.side ?? 'bottom';
  const align = props.align ?? 'center';
  const openDelay = Math.max(0, props.openDelay ?? props.delayDuration ?? 700);
  const closeDelay = Math.max(0, props.closeDelay ?? 0);
  const base = createUIFnOverlayBase({
    primitive: 'Tooltip',
    props: { ...props, placement: props.placement ?? placement(side, align) },
    env,
    openDelay,
    closeDelay,
    defaultPlacement: placement(side, align),
  });
  const actions: TooltipControllerActions = {
    ...base.actions,
    openWithDelay() {
      if (!props.disabled) base.actions.onTriggerPointerEnter('mouse');
    },
    close() { base.actions.setOpen(false, 'close-pointer-leave'); },
  };
  const ids = base.ids;
  const data = () => overlayStateData(base.getState());
  const parts: TooltipControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      id: ids.triggerId,
      aria: { describedby: base.getState().open ? ids.contentId : undefined },
      data: { ...data(), disabled: props.disabled ?? false },
      on: {
        pointerenter: (event) => { if (!props.disabled) actions.onTriggerPointerEnter(event?.pointerType); },
        pointerleave: () => actions.onTriggerPointerLeave(),
        focus: () => { if (!props.disabled) actions.onTriggerFocus(); },
        blur: () => actions.onTriggerBlur(),
        keydown: (event) => { if (event?.key === 'Escape') actions.onEscapeKeyDown(); },
      },
    }), { id: true, data: ['state'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: data() }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const state = base.getState();
      return {
        role: 'tooltip', id: ids.contentId,
        data: data(), hidden: !state.open && !state.forceMount,
      };
    }, { role: true, id: true, data: ['state'] }),
    arrow: base.part('arrow', () => ({
      id: ids.arrowId, aria: { hidden: true }, data: data(),
    }), { id: true, aria: ['hidden'], data: ['state'] }),
  };
  const getState = (): TooltipControllerState => {
    const state = base.getState();
    const [currentSide, rawAlign] = state.placement.split('-') as [TooltipSide, TooltipAlign | undefined];
    return {
      ...state,
      delayDuration: openDelay,
      openDelay,
      closeDelay,
      skipDelayDuration: Math.max(0, props.skipDelayDuration ?? 300),
      disableHoverableContent: props.disableHoverableContent ?? true,
      disabled: props.disabled ?? false,
      side: currentSide,
      align: rawAlign ?? 'center',
      sideOffset: props.sideOffset ?? 5,
      alignOffset: props.alignOffset ?? 0,
      collisionPadding: props.collisionPadding ?? 8,
      collisionDetection: props.collisionDetection ?? true,
    };
  };
  return base.controller(actions, parts, getState) as TooltipController;
}
