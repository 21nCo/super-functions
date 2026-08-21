import type { UIFnDomScope } from './scope';

export interface UIFnPointerTrackingOptions {
  readonly onMove: (event: PointerEvent) => void;
  readonly onEnd?: (event: PointerEvent) => void;
  readonly onCancel?: (event: PointerEvent) => void;
  readonly captureTarget?: Element | null;
}

export interface UIFnPointerTracking {
  readonly active: boolean;
  destroy(): void;
}

export function trackUIFnPointer(
  scope: UIFnDomScope,
  startEvent: PointerEvent,
  options: UIFnPointerTrackingOptions,
): UIFnPointerTracking {
  scope.assertAlive('track pointer');
  let active = true;
  const pointerId = startEvent.pointerId;
  const captureTarget = options.captureTarget;
  if (captureTarget && 'setPointerCapture' in captureTarget) {
    try {
      (captureTarget as Element & { setPointerCapture(id: number): void }).setPointerCapture(pointerId);
    } catch {
      // Some engines reject capture when the pointer is no longer active.
    }
  }
  const matches = (event: Event): event is PointerEvent =>
    (event as PointerEvent).pointerId === pointerId;
  let releases: Array<() => void> = [];
  const destroy = () => {
    if (!active) return;
    active = false;
    releases.forEach((release) => release());
    releases = [];
    if (captureTarget && 'releasePointerCapture' in captureTarget) {
      try {
        (captureTarget as Element & { releasePointerCapture(id: number): void }).releasePointerCapture(pointerId);
      } catch {
        // Capture may have been implicitly released by the browser.
      }
    }
  };
  const onLostPointerCapture = (event: Event) => {
    if (!active || !matches(event)) return;
    destroy();
    options.onCancel?.(event);
  };
  const releaseLostPointerCapture = captureTarget
    ? (() => {
        captureTarget.addEventListener('lostpointercapture', onLostPointerCapture);
        return scope.track('listener', () => captureTarget.removeEventListener('lostpointercapture', onLostPointerCapture), 'pointer-lost-capture');
      })()
    : scope.on('lostpointercapture', onLostPointerCapture, true);
  releases = [
    scope.on('pointermove', (event) => {
      if (active && matches(event)) options.onMove(event);
    }, true),
    scope.on('pointerup', (event) => {
      if (!active || !matches(event)) return;
      destroy();
      options.onEnd?.(event);
    }, true),
    scope.on('pointercancel', (event) => {
      if (!active || !matches(event)) return;
      destroy();
      options.onCancel?.(event);
    }, true),
    releaseLostPointerCapture,
  ];
  return {
    get active() {
      return active;
    },
    destroy,
  };
}
