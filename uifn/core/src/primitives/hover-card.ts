import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnOverlayPlacement,
  type UIFnStaticOverlayPart,
} from './overlay';

export type HoverCardSide = 'top' | 'right' | 'bottom' | 'left';
export type HoverCardAlign = 'start' | 'center' | 'end';

export interface CreateHoverCardProps extends UIFnOverlayCommonProps {
  openDelay?: number;
  closeDelay?: number;
  side?: HoverCardSide;
  align?: HoverCardAlign;
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  collisionDetection?: boolean;
  reducedMotion?: boolean;
}

export interface HoverCardState extends UIFnOverlayBaseState {
  readonly openDelay: number;
  readonly closeDelay: number;
  readonly side: HoverCardSide;
  readonly align: HoverCardAlign;
  readonly sideOffset: number;
  readonly alignOffset: number;
  readonly collisionPadding: number;
  readonly collisionDetection: boolean;
}

export interface HoverCardActions extends UIFnOverlayBaseActions {
  openWithDelay(): void;
  closeWithDelay(): void;
  cancelClose(): void;
}

export interface HoverCardControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  arrow: UIFnStaticOverlayPart;
}

export type HoverCardController = UIFnController<
  HoverCardState,
  HoverCardActions,
  HoverCardControllerParts,
  CreateHoverCardProps
>;

function placement(side: HoverCardSide, align: HoverCardAlign): UIFnOverlayPlacement {
  return align === 'center' ? side : `${side}-${align}`;
}

export function createHoverCardController(
  props: CreateHoverCardProps = {},
  env: UIFnEnvironment = {},
): HoverCardController {
  const side = props.side ?? 'bottom';
  const align = props.align ?? 'center';
  const openDelay = Math.max(0, props.openDelay ?? 700);
  const closeDelay = Math.max(0, props.closeDelay ?? 300);
  const base = createUIFnOverlayBase({
    primitive: 'HoverCard',
    props: { ...props, placement: props.placement ?? placement(side, align) },
    env,
    openDelay,
    closeDelay,
    defaultPlacement: placement(side, align),
  });
  const actions: HoverCardActions = {
    ...base.actions,
    openWithDelay() { base.actions.onTriggerPointerEnter('mouse'); },
    closeWithDelay() { base.actions.onTriggerPointerLeave(); },
    cancelClose() { base.actions.onContentPointerEnter('mouse'); },
  };
  const ids = base.ids;
  const data = () => overlayStateData(base.getState());
  const parts: HoverCardControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      id: ids.triggerId,
      aria: { describedby: base.getState().open ? ids.contentId : undefined },
      data: data(),
      on: {
        pointerenter: (event) => actions.onTriggerPointerEnter(event?.pointerType),
        pointerleave: () => actions.onTriggerPointerLeave(),
        focus: () => actions.onTriggerFocus(),
        blur: () => actions.onTriggerBlur(),
        keydown: (event) => { if (event?.key === 'Escape') actions.onEscapeKeyDown(); },
      },
    }), { id: true, data: ['state'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: data() }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const state = base.getState();
      return {
        id: ids.contentId,
        aria: { labelledby: ids.triggerId },
        data: data(), hidden: !state.open && !state.forceMount,
        on: {
          pointerenter: (event) => actions.onContentPointerEnter(event?.pointerType),
          pointerleave: () => actions.onContentPointerLeave(),
          keydown: (event) => { if (event?.key === 'Escape') actions.onEscapeKeyDown(); },
        },
      };
    }, { id: true, aria: ['labelledby'], data: ['state'] }),
    arrow: base.part('arrow', () => ({
      id: ids.arrowId, aria: { hidden: true }, data: data(),
    }), { id: true, aria: ['hidden'], data: ['state'] }),
  };
  const getState = (): HoverCardState => {
    const state = base.getState();
    const [currentSide, rawAlign] = state.placement.split('-') as [HoverCardSide, HoverCardAlign | undefined];
    return {
      ...state,
      openDelay,
      closeDelay,
      side: currentSide,
      align: rawAlign ?? 'center',
      sideOffset: props.sideOffset ?? 5,
      alignOffset: props.alignOffset ?? 0,
      collisionPadding: props.collisionPadding ?? 8,
      collisionDetection: props.collisionDetection ?? true,
    };
  };
  return base.controller(actions, parts, getState) as HoverCardController;
}
