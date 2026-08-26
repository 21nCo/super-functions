import {
  MeterContract,
  ProgressContract,
  createColorPickerController,
  createDatePickerController,
  createSliderController,
  createStepsController,
  createToastController,
  createUIFnCalendarDate,
  resolveUIFnAxisPercent,
} from '@uifn/core';
import { applyUIFnPartProps, createUIFnDomPlatform, createUIFnGestureBinding } from '@uifn/dom';

interface Phase10BrowserState {
  readonly value: readonly number[];
  readonly activePointerIds: readonly number[];
  readonly starts: readonly string[];
  readonly moves: number;
  readonly ends: number;
  readonly cancellations: readonly string[];
  readonly touchAction: string;
  readonly keyboard: Readonly<Record<string, number>>;
}

interface Phase10BrowserResult extends Phase10BrowserState {
  readonly vectorId: 'TV-PRIM-006-P/N+TV-PRIM-007-P/N+TV-PRIM-008-P/N+TV-I18N-001-P/N';
  readonly outcome: 'pass';
  readonly locale: Readonly<Record<string, unknown>>;
  readonly status: Readonly<Record<string, unknown>>;
  readonly liveRegion: Readonly<Record<string, unknown>>;
  readonly resources: number;
  readonly touchActionRestored: boolean;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function wait(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

let fixture: HTMLElement | null = null;
let track: HTMLElement | null = null;
let binding: ReturnType<typeof createUIFnGestureBinding> | null = null;
let releaseThumb: (() => void) | null = null;
let releaseTouch: (() => void) | null = null;
let platform: ReturnType<typeof createUIFnDomPlatform> | null = null;
let slider: ReturnType<typeof createSliderController> | null = null;
let date: ReturnType<typeof createDatePickerController> | null = null;
let color: ReturnType<typeof createColorPickerController> | null = null;
let steps: ReturnType<typeof createStepsController> | null = null;
let toast: ReturnType<typeof createToastController> | null = null;
let starts: string[] = [];
let moves = 0;
let ends = 0;
let cancellations: string[] = [];
let keyboard = { before: 0, after: 0 };
let previousTouchAction = '';

function percent(event: PointerEvent): number {
  const rect = track!.getBoundingClientRect();
  return resolveUIFnAxisPercent(
    { x: event.clientX, y: event.clientY },
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    'horizontal',
    'rtl',
  );
}

function currentState(): Phase10BrowserState {
  invariant(slider && binding && track, 'Phase 10 gesture harness is not initialized.');
  return Object.freeze({
    value: Object.freeze([...slider.state.value]),
    activePointerIds: Object.freeze([...binding.activePointerIds]),
    starts: Object.freeze([...starts]), moves, ends,
    cancellations: Object.freeze([...cancellations]),
    touchAction: track.style.touchAction,
    keyboard: Object.freeze({ ...keyboard }),
  });
}

export function setupPhase10Vectors(options: { readonly zoom?: number } = {}) {
  if (fixture) finishPhase10Vectors();
  starts = []; moves = 0; ends = 0; cancellations = []; keyboard = { before: 0, after: 0 };
  document.documentElement.dir = 'rtl';
  document.body.style.zoom = String(options.zoom ?? 1);
  fixture = document.createElement('section');
  fixture.dataset.phase10Fixture = '';
  fixture.dataset.vectorRoot = '';
  fixture.style.cssText = 'direction:rtl;width:420px;padding:24px;border:2px solid #475569;margin:24px;';
  const heading = document.createElement('h2'); heading.textContent = 'PHASE 10';
  track = document.createElement('div');
  track.id = 'phase10-track';
  track.style.cssText = 'width:320px;height:48px;background:#dbeafe;border:2px solid #1d4ed8;position:relative;';
  const thumb = document.createElement('div');
  thumb.id = 'phase10-thumb'; thumb.style.cssText = 'width:24px;height:24px;background:#1d4ed8;border-radius:50%;';
  track.append(thumb); fixture.append(heading, track); document.body.append(fixture);

  platform = createUIFnDomPlatform({ root: document });
  slider = createSliderController({ defaultValue: [50], min: 0, max: 100, step: 1, dir: 'rtl', locale: 'ar-EG' }, {
    root: document, ownerDocument: document, ownerWindow: window, direction: 'rtl', locale: 'ar-EG', timeZone: 'UTC', reducedMotion: true,
  });
  releaseThumb = applyUIFnPartProps(thumb, slider.parts.thumb.getProps(0));
  binding = createUIFnGestureBinding(platform.scope, {
    element: track, orientation: 'horizontal',
    onStart(event) { const pointerType = event.pointerType || 'mouse'; starts.push(pointerType); slider!.actions.pointerStart(event.pointerId, percent(event), pointerType as 'mouse' | 'pen' | 'touch'); },
    onMove(event) { moves += 1; slider!.actions.pointerMove(event.pointerId, percent(event), { x: event.clientX, y: event.clientY }); },
    onEnd(event) { ends += 1; slider!.actions.pointerEnd(event.pointerId); },
    onCancel(event, reason) { cancellations.push(`${event.pointerId}:${reason}`); reason === 'lostpointercapture' ? slider!.actions.lostPointerCapture(event.pointerId) : slider!.actions.pointerCancel(event.pointerId); },
  });
  const onTouchStart = () => { if (starts.at(-1) !== 'touch') starts.push('touch'); };
  track.addEventListener('touchstart', onTouchStart, { passive: true });
  releaseTouch = platform.scope.track('listener', () => track?.removeEventListener('touchstart', onTouchStart), 'phase10-real-touch');
  previousTouchAction = '';

  date = createDatePickerController({ defaultValue: createUIFnCalendarDate(2024, 3, 8), locale: 'ja-JP', calendar: 'japanese', timeZone: 'Asia/Tokyo', unavailable: (value) => value.day === 9 }, { root: document, locale: 'ja-JP', timeZone: 'Asia/Tokyo' });
  color = createColorPickerController({ defaultValue: '#33aaff80', colorSpace: 'hsl', alpha: true }, { root: document, locale: 'de-DE' });
  steps = createStepsController({ count: 3, defaultStep: 1, locale: 'hi-IN', label: 'चरण' }, { root: document, locale: 'hi-IN' });
  toast = createToastController({ limit: 1, duration: 10_000, toasts: [{ id: 'first', title: '通知' }, { id: 'queued', title: 'التالي' }] }, { root: document });
  toast.actions.pause('browser-fixture');
  const rect = track.getBoundingClientRect();
  return Object.freeze({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

export function releasePhase10PointerCapture(): boolean {
  invariant(binding && track, 'Phase 10 gesture harness is not initialized.');
  const [pointerId] = binding.activePointerIds;
  if (pointerId === undefined || !track.hasPointerCapture(pointerId)) return false;
  track.releasePointerCapture(pointerId);
  return true;
}

export function runPhase10SyntheticTerminalVectors(): Phase10BrowserState {
  invariant(track, 'Phase 10 gesture harness is not initialized.');
  const down = new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 73, pointerType: 'pen', button: 0, clientX: track.getBoundingClientRect().left + 20, clientY: track.getBoundingClientRect().top + 20 });
  track.dispatchEvent(down);
  document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, composed: true, pointerId: 73, pointerType: 'pen' }));
  track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 74, pointerType: 'pen', button: 0, clientX: track.getBoundingClientRect().left + 30, clientY: track.getBoundingClientRect().top + 20 }));
  track.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: false, composed: false, pointerId: 74, pointerType: 'pen' }));
  const first = new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 81, pointerType: 'mouse', button: 0, clientX: track.getBoundingClientRect().left + 40, clientY: track.getBoundingClientRect().top + 20 });
  const second = new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 82, pointerType: 'pen', button: 0, clientX: track.getBoundingClientRect().left + 280, clientY: track.getBoundingClientRect().top + 20 });
  track.dispatchEvent(first); track.dispatchEvent(second);
  invariant(binding?.activePointerIds.length === 2, 'Multi-pointer binding did not retain both pointers.');
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 81, pointerType: 'mouse' }));
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 82, pointerType: 'pen' }));
  return currentState();
}

export function runPhase10KeyboardVector(): Phase10BrowserState {
  invariant(slider, 'Phase 10 gesture harness is not initialized.');
  keyboard.before = slider.state.value[0];
  fixture!.querySelector<HTMLElement>('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  keyboard.after = slider.state.value[0];
  invariant(keyboard.after === keyboard.before - 1, 'RTL ArrowRight did not decrement the logical slider value.');
  return currentState();
}

export async function runPhase10LiveRegionVector(): Promise<Readonly<Record<string, unknown>>> {
  invariant(platform, 'Phase 10 gesture harness is not initialized.');
  const liveRegion = platform.liveRegion;
  const region = document.querySelector<HTMLElement>('[data-uifn-live-region] [role="status"]')!;
  let publishCount = 0;
  const observer = new MutationObserver(() => { if (region.textContent) publishCount += 1; });
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  const first = liveRegion.announce({ message: '٣ من ٥', politeness: 'polite', dedupeKey: 'rating' });
  const duplicate = liveRegion.announce({ message: '٣ من ٥', politeness: 'polite', dedupeKey: 'rating' });
  await wait(250);
  observer.disconnect();
  invariant(first === duplicate && publishCount === 1 && region.textContent === '٣ من ٥', 'Live-region dedupe or rate limit failed.');
  return Object.freeze({ deduped: true, publishCount, text: region.textContent });
}

export function finishPhase10Vectors(liveRegion: Readonly<Record<string, unknown>> = {}): Phase10BrowserResult {
  invariant(slider && date && color && steps && toast && platform && binding && track && fixture, 'Phase 10 gesture harness is not initialized.');
  const before = currentState();
  const locale = Object.freeze({ date: date.state.displayValue, calendar: date.state.calendar, timeZone: date.state.timeZone, grid: date.state.grid.length, color: color.state.serialized, roundTripError: color.state.roundTripError, arabicValue: slider.state.valueText[0] });
  const meter = MeterContract.getParts({ value: 90, low: 30, high: 70, optimum: 10 }, { scopeId: 'browser-meter' });
  const progress = ProgressContract.getParts({ value: null }, { scopeId: 'browser-progress' });
  const status = Object.freeze({ meterRole: meter.root.role, meterState: meter.root.data?.state, progressRole: progress.root.role, indeterminate: progress.root.aria?.valuenow === undefined, stepCurrent: steps.parts.item.getProps(1).aria?.current, toastVisible: toast.state.visible.length, toastQueued: toast.state.queued.length, toastPaused: toast.state.pauseReasons.includes('browser-fixture') });
  binding.destroy(); releaseTouch?.(); releaseThumb?.(); slider.destroy(); date.destroy(); color.destroy(); steps.destroy(); toast.destroy(); platform.liveRegion.destroy(); fixture.remove(); platform.destroy();
  const resources = platform.scope.resources().total;
  const restored = track.style.touchAction === previousTouchAction;
  document.body.style.zoom = ''; document.documentElement.dir = 'ltr';
  fixture = null; track = null; binding = null; releaseThumb = null; releaseTouch = null; slider = null; date = null; color = null; steps = null; toast = null; platform = null;
  invariant(resources === 0, `Phase 10 browser vector leaked ${resources} DOM resources.`);
  invariant(restored, 'Gesture binding did not restore touch-action on destroy.');
  return Object.freeze({
    vectorId: 'TV-PRIM-006-P/N+TV-PRIM-007-P/N+TV-PRIM-008-P/N+TV-I18N-001-P/N', outcome: 'pass',
    ...before, locale, status, liveRegion: Object.freeze({ ...liveRegion }), resources, touchActionRestored: restored,
  });
}

declare global {
  interface Window {
    __UIFN_PHASE10_HARNESS__: {
      setup(options?: { zoom?: number }): ReturnType<typeof setupPhase10Vectors>;
      state(): Phase10BrowserState;
      releaseCapture(): boolean;
      terminal(): Phase10BrowserState;
      keyboard(): Phase10BrowserState;
      liveRegion(): Promise<Readonly<Record<string, unknown>>>;
      finish(liveRegion?: Readonly<Record<string, unknown>>): Phase10BrowserResult;
    };
  }
}

window.__UIFN_PHASE10_HARNESS__ = Object.freeze({ setup: setupPhase10Vectors, state: currentState, releaseCapture: releasePhase10PointerCapture, terminal: runPhase10SyntheticTerminalVectors, keyboard: runPhase10KeyboardVector, liveRegion: runPhase10LiveRegionVector, finish: finishPhase10Vectors });
