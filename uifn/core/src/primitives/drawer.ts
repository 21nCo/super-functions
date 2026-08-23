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

export type DrawerSide = 'top' | 'right' | 'bottom' | 'left';
export type DrawerDragPhase = 'idle' | 'dragging';

export interface DrawerProps extends UIFnOverlayCommonProps {
  side?: DrawerSide;
  dismissThreshold?: number;
  onDragStart?: () => void;
  onDragMove?: (distance: number) => void;
  onDragEnd?: (dismissed: boolean) => void;
}

export interface DrawerState extends UIFnOverlayBaseState {
  readonly side: DrawerSide;
  readonly dismissThreshold: number;
  readonly dragPhase: DrawerDragPhase;
  readonly dragDistance: number;
  readonly dragProgress: number;
}

export interface DrawerActions extends UIFnOverlayBaseActions {
  dragStart(): void;
  dragMove(distance: number): void;
  dragEnd(): boolean;
  dragCancel(): void;
}

export interface DrawerControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  portal: UIFnStaticOverlayPart;
  backdrop: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  handle: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  close: UIFnStaticOverlayPart;
}

export type DrawerController = UIFnController<DrawerState, DrawerActions, DrawerControllerParts, DrawerProps>;

export function createDrawerController(
  props: DrawerProps = {},
  env: UIFnEnvironment = {},
): DrawerController {
  const side = props.side ?? 'right';
  const threshold = Math.min(1, Math.max(0.05, props.dismissThreshold ?? 0.5));
  const base = createUIFnOverlayBase({ primitive: 'Drawer', props, env });
  let dragPhase: DrawerDragPhase = 'idle';
  let dragDistance = 0;
  const actions: DrawerActions = {
    ...base.actions,
    dragStart() {
      if (!base.getState().open || dragPhase === 'dragging') return;
      dragPhase = 'dragging';
      dragDistance = 0;
      props.onDragStart?.();
      base.patchState({ lastChangeReason: 'drag-start' }, 'drag-start');
    },
    dragMove(distance) {
      if (dragPhase !== 'dragging' || !Number.isFinite(distance)) return;
      dragDistance = Math.max(0, distance);
      props.onDragMove?.(dragDistance);
      base.patchState({ lastChangeReason: 'drag-move' }, 'drag-move');
    },
    dragEnd() {
      if (dragPhase !== 'dragging') return false;
      const dismissed = dragDistance >= threshold;
      dragPhase = 'idle';
      props.onDragEnd?.(dismissed);
      base.patchState({ lastChangeReason: 'drag-end' }, 'drag-end');
      if (dismissed) base.actions.close('close-drag-threshold');
      dragDistance = 0;
      return dismissed;
    },
    dragCancel() {
      if (dragPhase === 'idle' && dragDistance === 0) return;
      dragPhase = 'idle';
      dragDistance = 0;
      base.patchState({ lastChangeReason: 'drag-cancel' }, 'drag-cancel');
    },
  };
  const ids = base.ids;
  const data = () => ({ ...overlayStateData(base.getState()), side, drag: dragPhase });
  const parts: DrawerControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      role: 'button', id: ids.triggerId, tabIndex: 0, attributes: { type: 'button' },
      aria: { haspopup: 'dialog', expanded: base.getState().open, controls: ids.contentId },
      data: data(), on: { click: () => actions.toggle() },
    }), { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'], attributes: ['type'], data: ['state'] }),
    portal: base.part('portal', () => ({ id: ids.portalId, data: data() }), { id: true, data: ['state'] }),
    backdrop: base.part('backdrop', () => ({
      id: ids.backdropId, aria: { hidden: true }, data: data(),
      hidden: !base.getState().open && !base.getState().forceMount,
    }), { id: true, aria: ['hidden'], data: ['state'] }),
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
    handle: base.part('handle', () => ({
      role: 'button', id: `${ids.contentId}-handle`, tabIndex: 0,
      aria: { label: `Drag ${side} drawer` }, data: data(),
    }), { role: true, id: true, tabIndex: true, aria: ['label'], data: ['state'] }),
    title: base.part('title', () => ({ id: ids.titleId, data: data() }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: data() }), { id: true }),
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': 'Close drawer' },
      data: data(), on: { click: () => actions.close('close-trigger') },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
  };
  const getState = (): DrawerState => ({
    ...base.getState(),
    side,
    dismissThreshold: threshold,
    dragPhase,
    dragDistance,
    dragProgress: Math.min(1, dragDistance),
  });
  return base.controller(actions, parts, getState) as DrawerController;
}
