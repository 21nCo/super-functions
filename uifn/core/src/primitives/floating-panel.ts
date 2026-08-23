import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { mergePartProps, type UIFnPartProps } from '../parts';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnOverlayPlacement,
  type UIFnStaticOverlayPart,
} from './overlay';

export interface FloatingPanelPoint { readonly x: number; readonly y: number }
export interface FloatingPanelSize { readonly width: number; readonly height: number }
export type FloatingPanelInteractionPhase = 'idle' | 'dragging' | 'resizing';
export type FloatingPanelResizeEdge = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';

export interface FloatingPanelResizeHandlePart {
  readonly name: 'resizeHandle';
  getProps(edge: FloatingPanelResizeEdge, userProps?: UIFnPartProps): UIFnPartProps;
}

export interface FloatingPanelProps extends UIFnOverlayCommonProps {
  draggable?: boolean;
  resizable?: boolean;
  defaultPosition?: FloatingPanelPoint;
  defaultSize?: FloatingPanelSize;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  placement?: UIFnOverlayPlacement;
  onPositionChange?: (position: FloatingPanelPoint) => void;
  onSizeChange?: (size: FloatingPanelSize) => void;
}

export interface FloatingPanelState extends UIFnOverlayBaseState {
  readonly draggable: boolean;
  readonly resizable: boolean;
  readonly interactionPhase: FloatingPanelInteractionPhase;
  readonly position: FloatingPanelPoint;
  readonly size: FloatingPanelSize;
}

export interface FloatingPanelActions extends UIFnOverlayBaseActions {
  dragStart(): void;
  dragMove(delta: FloatingPanelPoint): void;
  dragEnd(): void;
  resizeStart(): void;
  resizeMove(delta: FloatingPanelSize): void;
  resizeEnd(): void;
}

export interface FloatingPanelControllerParts {
  root: UIFnStaticOverlayPart;
  trigger: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  header: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  dragHandle: UIFnStaticOverlayPart;
  resizeHandle: FloatingPanelResizeHandlePart;
  close: UIFnStaticOverlayPart;
}

export type FloatingPanelController = UIFnController<
  FloatingPanelState,
  FloatingPanelActions,
  FloatingPanelControllerParts,
  FloatingPanelProps
>;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createFloatingPanelController(
  props: FloatingPanelProps = {},
  env: UIFnEnvironment = {},
): FloatingPanelController {
  const base = createUIFnOverlayBase({ primitive: 'FloatingPanel', props, env, defaultPlacement: 'bottom-start' });
  const draggable = props.draggable ?? true;
  const resizable = props.resizable ?? true;
  let interactionPhase: FloatingPanelInteractionPhase = 'idle';
  let position: FloatingPanelPoint = Object.freeze({
    x: finite(props.defaultPosition?.x ?? 0, 0),
    y: finite(props.defaultPosition?.y ?? 0, 0),
  });
  let size: FloatingPanelSize = Object.freeze({
    width: Math.max(1, finite(props.defaultSize?.width ?? 320, 320)),
    height: Math.max(1, finite(props.defaultSize?.height ?? 240, 240)),
  });
  const clampSize = (next: FloatingPanelSize): FloatingPanelSize => Object.freeze({
    width: Math.min(props.maxWidth ?? Number.POSITIVE_INFINITY, Math.max(props.minWidth ?? 160, next.width)),
    height: Math.min(props.maxHeight ?? Number.POSITIVE_INFINITY, Math.max(props.minHeight ?? 120, next.height)),
  });
  const actions: FloatingPanelActions = {
    ...base.actions,
    dragStart() {
      if (!draggable || !base.getState().open) return;
      interactionPhase = 'dragging';
      base.patchState({ lastChangeReason: 'drag-start' }, 'drag-start');
    },
    dragMove(delta) {
      if (interactionPhase !== 'dragging' || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;
      position = Object.freeze({ x: position.x + delta.x, y: position.y + delta.y });
      props.onPositionChange?.(position);
      base.patchState({ lastChangeReason: 'drag-move' }, 'drag-move');
    },
    dragEnd() {
      if (interactionPhase !== 'dragging') return;
      interactionPhase = 'idle';
      base.patchState({ lastChangeReason: 'drag-end' }, 'drag-end');
    },
    resizeStart() {
      if (!resizable || !base.getState().open) return;
      interactionPhase = 'resizing';
      base.patchState({ lastChangeReason: 'resize-start' }, 'resize-start');
    },
    resizeMove(delta) {
      if (interactionPhase !== 'resizing' || !Number.isFinite(delta.width) || !Number.isFinite(delta.height)) return;
      size = clampSize({ width: size.width + delta.width, height: size.height + delta.height });
      props.onSizeChange?.(size);
      base.patchState({ lastChangeReason: 'resize-move' }, 'resize-move');
    },
    resizeEnd() {
      if (interactionPhase !== 'resizing') return;
      interactionPhase = 'idle';
      base.patchState({ lastChangeReason: 'resize-end' }, 'resize-end');
    },
  };
  const ids = base.ids;
  const data = () => ({ ...overlayStateData(base.getState()), interaction: interactionPhase });
  const parts: FloatingPanelControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    trigger: base.part('trigger', () => ({
      role: 'button', id: ids.triggerId, tabIndex: 0, attributes: { type: 'button' },
      aria: { haspopup: 'dialog', expanded: base.getState().open, controls: ids.contentId },
      data: data(), on: { click: () => actions.toggle() },
    }), { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'], attributes: ['type'], data: ['state'] }),
    positioner: base.part('positioner', () => ({
      id: ids.positionerId, data: data(),
      style: { transform: `translate(${position.x}px, ${position.y}px)` },
    }), { id: true, data: ['state'] }),
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
        style: { width: `${size.width}px`, height: `${size.height}px` },
      };
    }, { role: true, id: true, tabIndex: true, data: ['state'] }),
    header: base.part('header', () => ({ id: `${ids.contentId}-header`, data: data() }), { id: true }),
    title: base.part('title', () => ({ id: ids.titleId, data: data() }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: data() }), { id: true }),
    dragHandle: base.part('dragHandle', () => ({
      role: 'button', id: `${ids.contentId}-drag-handle`, tabIndex: draggable ? 0 : -1,
      aria: { label: 'Move panel', disabled: !draggable || undefined }, data: data(),
    }), { role: true, id: true, tabIndex: true, aria: ['label'] }),
    resizeHandle: {
      name: 'resizeHandle',
      getProps(edge, userProps) {
        const orientation = edge === 'east' || edge === 'west' ? 'vertical' : 'horizontal';
        const horizontal = edge === 'east' || edge === 'west' || edge.includes('east') || edge.includes('west');
        const value = horizontal ? size.width : size.height;
        const minimum = horizontal ? props.minWidth ?? 160 : props.minHeight ?? 120;
        const configuredMaximum = horizontal ? props.maxWidth : props.maxHeight;
        const maximum = configuredMaximum !== undefined && Number.isFinite(configuredMaximum)
          ? Math.max(minimum, configuredMaximum)
          : Math.max(minimum, value, 10_000);
        return mergePartProps({
          role: 'separator', id: `${ids.contentId}-resize-handle-${edge}`, tabIndex: resizable ? 0 : -1,
          aria: {
            label: `Resize panel ${edge}`,
            orientation,
            disabled: !resizable || undefined,
            valuemin: minimum,
            valuemax: maximum,
            valuenow: value,
            valuetext: `${Math.round(size.width)} by ${Math.round(size.height)} pixels`,
          },
          data: { ...data(), edge },
          on: {
            keydown: (event) => {
              const key = event?.key ?? '';
              const amount = event?.shiftKey ? 10 : 1;
              let width = 0;
              let height = 0;
              if (key === 'ArrowRight') width = edge.includes('east') ? amount : edge.includes('west') ? -amount : 0;
              if (key === 'ArrowLeft') width = edge.includes('east') ? -amount : edge.includes('west') ? amount : 0;
              if (key === 'ArrowDown') height = edge.includes('south') ? amount : edge.includes('north') ? -amount : 0;
              if (key === 'ArrowUp') height = edge.includes('south') ? -amount : edge.includes('north') ? amount : 0;
              if (width === 0 && height === 0) return;
              event?.preventDefault?.();
              actions.resizeStart();
              actions.resizeMove({ width, height });
              actions.resizeEnd();
            },
          },
        }, userProps, {
          component: 'FloatingPanel',
          part: 'resizeHandle',
          required: { role: true, id: true, tabIndex: true, aria: ['label', 'orientation', 'valuemin', 'valuemax', 'valuenow', 'valuetext'], data: ['edge'] },
        });
      },
    },
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': 'Close panel' }, data: data(),
      on: { click: () => actions.close('close-trigger') },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
  };
  const getState = (): FloatingPanelState => ({
    ...base.getState(), draggable, resizable, interactionPhase, position, size,
  });
  return base.controller(actions, parts, getState) as FloatingPanelController;
}
