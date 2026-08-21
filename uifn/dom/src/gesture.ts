import type { UIFnDomScope } from './scope';
import { trackUIFnPointer, type UIFnPointerTracking } from './pointer';

export interface UIFnGestureBindingOptions {
  readonly element: HTMLElement;
  readonly orientation?: 'horizontal' | 'vertical' | 'both';
  readonly disabled?: () => boolean;
  readonly onStart: (event: PointerEvent) => void;
  readonly onMove: (event: PointerEvent) => void;
  readonly onEnd: (event: PointerEvent) => void;
  readonly onCancel: (event: PointerEvent, reason: 'pointercancel' | 'lostpointercapture' | 'destroy') => void;
}

export interface UIFnGestureBinding {
  readonly activePointerIds: readonly number[];
  cancel(pointerId: number, reason?: 'pointercancel' | 'lostpointercapture' | 'destroy'): void;
  destroy(): void;
}

export type UIFnRangeGesturePrimitive =
  | 'Slider'
  | 'AngleSlider'
  | 'Carousel'
  | 'SignaturePad'
  | 'Splitter'
  | 'ImageCropper'
  | 'ColorPicker'
  | 'ScrollArea';

export interface UIFnRangeGestureDomBindingOptions {
  readonly scope: UIFnDomScope;
  readonly primitive: UIFnRangeGesturePrimitive;
  readonly element: HTMLElement;
  readonly value?: unknown;
  readonly controller: {
    readonly actions: Record<string, (...args: any[]) => unknown>;
    getState(): Record<string, any>;
  };
}

function localPoint(element: HTMLElement, event: PointerEvent): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function axisPercent(element: HTMLElement, event: PointerEvent, orientation: string): number {
  const rect = element.getBoundingClientRect();
  const size = orientation === 'vertical' ? rect.height : rect.width;
  const offset = orientation === 'vertical' ? event.clientY - rect.top : event.clientX - rect.left;
  return Math.max(0, Math.min(100, size > 0 ? offset / size * 100 : 0));
}

/** Maps pointer capture and geometry to core gesture actions; framework adapters only supply nodes. */
export function createUIFnRangeGestureDomBinding(options: UIFnRangeGestureDomBindingOptions): UIFnGestureBinding {
  const { controller, element, primitive } = options;
  const state = () => controller.getState();
  const point = (event: PointerEvent) => localPoint(element, event);
  const kind = (event: PointerEvent) => event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
  const angle = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    const degrees = (Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI + 450) % 360;
    const minimum = Number(state().min ?? 0);
    const maximum = Number(state().max ?? 360);
    return minimum + degrees / 360 * (maximum - minimum);
  };
  const coordinate = (event: PointerEvent) => state().orientation === 'vertical' ? event.clientY : event.clientX;
  const invoke = (event: PointerEvent, phase: 'start' | 'move' | 'end' | 'cancel', reason?: string) => {
    const actions = controller.actions;
    if (primitive === 'Slider') {
      if (phase === 'start') actions.pointerStart?.(event.pointerId, axisPercent(element, event, state().orientation), kind(event));
      else if (phase === 'move') actions.pointerMove?.(event.pointerId, axisPercent(element, event, state().orientation), point(event));
      else actions[phase === 'end' ? 'pointerEnd' : reason === 'lostpointercapture' ? 'lostPointerCapture' : 'pointerCancel']?.(event.pointerId);
    }
    else if (primitive === 'AngleSlider') actions[phase === 'start' ? 'pointerStart' : phase === 'move' ? 'pointerMove' : phase === 'end' ? 'pointerEnd' : reason === 'lostpointercapture' ? 'lostPointerCapture' : 'pointerCancel']?.(event.pointerId, ...(phase === 'start' || phase === 'move' ? [angle(event)] : []), ...(phase === 'start' ? [kind(event)] : []));
    else if (primitive === 'Carousel') actions[phase === 'start' ? 'dragStart' : phase === 'move' ? 'dragMove' : phase === 'end' ? 'dragEnd' : reason === 'lostpointercapture' ? 'lostPointerCapture' : 'dragCancel']?.(event.pointerId, ...(phase === 'start' || phase === 'move' ? [point(event)] : []), ...(phase === 'start' ? [kind(event)] : []));
    else if (primitive === 'SignaturePad') actions[phase === 'start' ? 'pointerStart' : phase === 'move' ? 'pointerMove' : phase === 'end' ? 'pointerEnd' : reason === 'lostpointercapture' ? 'lostPointerCapture' : 'pointerCancel']?.(event.pointerId, ...(phase === 'start' || phase === 'move' ? [{ ...point(event), pressure: event.pressure, time: options.scope.environment.now() }] : []));
    else if (primitive === 'Splitter') actions[phase === 'start' ? 'resizeStart' : phase === 'move' ? 'resizeMove' : phase === 'end' ? 'resizeEnd' : reason === 'lostpointercapture' ? 'lostPointerCapture' : 'resizeCancel']?.(event.pointerId, ...(phase === 'start' ? [Number(options.value ?? 0), coordinate(event), kind(event)] : phase === 'move' ? [coordinate(event)] : []));
    else if (primitive === 'ImageCropper') {
      if (phase === 'start') options.value === undefined ? actions.startDrag?.(point(event)) : actions.startResize?.(options.value, point(event));
      else if (phase === 'move') actions.move?.(point(event));
      else actions.endInteraction?.();
    } else if (primitive === 'ColorPicker' && (phase === 'start' || phase === 'move')) {
      if (options.value === undefined) {
        actions.setArea?.(
          axisPercent(element, event, 'horizontal'),
          axisPercent(element, event, 'vertical'),
        );
      } else {
        const channel = String(options.value);
        const maximum = channel === 'alpha'
          ? 1
          : channel === 'h'
            ? 360
            : ['r', 'g', 'b'].includes(channel)
              ? 255
              : 100;
        actions.setChannel?.(
          channel,
          axisPercent(element, event, 'horizontal') / 100 * maximum,
        );
      }
    } else if (primitive === 'ScrollArea') {
      if (phase === 'start' || phase === 'move') actions[options.value === 'horizontal' ? 'dragHorizontalThumb' : 'dragVerticalThumb']?.(axisPercent(element, event, String(options.value)));
      else actions.endInteraction?.();
    }
  };
  return createUIFnGestureBinding(options.scope, {
    element,
    orientation: primitive === 'ColorPicker'
      ? options.value === undefined ? 'both' : 'horizontal'
      : state().orientation ?? (options.value === 'horizontal' ? 'horizontal' : options.value === 'vertical' ? 'vertical' : 'both'),
    disabled: () => Boolean(state().disabled || state().readOnly),
    onStart: (event) => invoke(event, 'start'),
    onMove: (event) => invoke(event, 'move'),
    onEnd: (event) => invoke(event, 'end'),
    onCancel: (event, reason) => invoke(event, 'cancel', reason),
  });
}

export function createUIFnGestureBinding(scope: UIFnDomScope, options: UIFnGestureBindingOptions): UIFnGestureBinding {
  scope.assertAlive('create gesture binding');
  const trackers = new Map<number, UIFnPointerTracking>();
  const events = new Map<number, PointerEvent>();
  const previousTouchAction = options.element.style.touchAction;
  options.element.style.touchAction = options.orientation === 'horizontal' ? 'pan-y' : options.orientation === 'vertical' ? 'pan-x' : 'none';
  let destroyed = false;
  const cancel = (pointerId: number, reason: 'pointercancel' | 'lostpointercapture' | 'destroy' = 'pointercancel') => {
    const tracker = trackers.get(pointerId);
    const event = events.get(pointerId);
    if (!tracker || !event) return;
    trackers.delete(pointerId);
    events.delete(pointerId);
    tracker.destroy();
    options.onCancel(event, reason);
  };
  const onPointerDown = (rawEvent: Event) => {
    if (destroyed || options.disabled?.()) return;
    const event = rawEvent as PointerEvent;
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    events.set(event.pointerId, event);
    options.onStart(event);
    const tracker = trackUIFnPointer(scope, event, {
      captureTarget: options.element,
      onMove(moveEvent) { events.set(moveEvent.pointerId, moveEvent); options.onMove(moveEvent); },
      onEnd(endEvent) { trackers.delete(endEvent.pointerId); events.delete(endEvent.pointerId); options.onEnd(endEvent); },
      onCancel(cancelEvent) {
        const reason = cancelEvent.type === 'lostpointercapture' ? 'lostpointercapture' : 'pointercancel';
        trackers.delete(cancelEvent.pointerId); events.delete(cancelEvent.pointerId); options.onCancel(cancelEvent, reason);
      },
    });
    trackers.set(event.pointerId, tracker);
  };
  options.element.addEventListener('pointerdown', onPointerDown);
  const releaseListener = scope.track('listener', () => options.element.removeEventListener('pointerdown', onPointerDown), 'gesture-pointerdown');
  return {
    get activePointerIds() { return Object.freeze([...trackers.keys()]); },
    cancel,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      [...trackers.keys()].forEach((pointerId) => cancel(pointerId, 'destroy'));
      releaseListener();
      options.element.style.touchAction = previousTouchAction;
    },
  };
}
