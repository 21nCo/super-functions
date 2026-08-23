import { describe, expect, it, vi } from 'vitest';
import {
  assertUIFnRangeDirection,
  colorUIFnDistance,
  createUIFnCalendarDate,
  firstUIFnDayOfWeek,
  hslaToUIFnRgba,
  parseUIFnColor,
  parseUIFnIsoDate,
  resolveUIFnAxisPercent,
  resolveUIFnZonedDateTime,
  rgbaToUIFnHsla,
} from '../index';
import { createManualRuntimeScheduler } from '../internal/runtime/scheduler';
import {
  MeterContract,
  ProgressContract,
  assertUIFnAnnouncementBudget,
  assertUIFnCancelledGesture,
  assertUIFnNoTimerAfterDestroy,
  createAngleSliderController,
  createCarouselController,
  createColorPickerController,
  createDateInputController,
  createDatePickerController,
  createRatingGroupController,
  createSignaturePadController,
  createSliderController,
  createSplitterController,
  createStepsController,
  createTimerController,
  createToastController,
  createTreeViewController,
} from '../primitives';

const deterministicEnv = (locale = 'en-US', direction: 'ltr' | 'rtl' = 'ltr') => ({
  mode: 'test' as const, locale, direction, timeZone: 'UTC', reducedMotion: true,
  generateId: (scope: string) => `phase10-${scope}`,
});

describe('PHASE_10 exact catalog contracts', () => {
  it('exposes exact anatomy for the twelve interactive controllers and two static contracts', () => {
    const controllers = [
      [createAngleSliderController({}, deterministicEnv()), ['root', 'track', 'thumb', 'valueText', 'hiddenInput']],
      [createCarouselController({ itemCount: 3 }, deterministicEnv()), ['root', 'viewport', 'item', 'previous', 'next', 'indicatorGroup', 'indicator', 'liveRegion']],
      [createRatingGroupController({}, deterministicEnv()), ['root', 'label', 'control', 'item', 'itemIndicator', 'hiddenInput', 'valueText']],
      [createSliderController({}, deterministicEnv()), ['root', 'label', 'control', 'track', 'range', 'thumb', 'valueText', 'hiddenInput']],
      [createSignaturePadController({}, deterministicEnv()), ['root', 'label', 'canvas', 'clear', 'undo', 'status', 'hiddenInput']],
      [createSplitterController({}, deterministicEnv()), ['root', 'panel', 'resizeTrigger', 'resizeHandle']],
      [createColorPickerController({}, deterministicEnv()), ['root', 'label', 'control', 'trigger', 'positioner', 'content', 'area', 'areaThumb', 'channelSlider', 'channelInput', 'swatch', 'hiddenInput']],
      [createDateInputController({}, deterministicEnv()), ['root', 'label', 'segment', 'hiddenInput', 'error']],
      [createDatePickerController({}, deterministicEnv()), ['root', 'label', 'input', 'segment', 'trigger', 'positioner', 'content', 'header', 'previous', 'next', 'grid', 'gridLabel', 'cell', 'cellTrigger', 'hiddenInput']],
      [createTimerController({ duration: 1000 }, deterministicEnv()), ['root', 'value', 'start', 'pause', 'reset', 'status']],
      [createStepsController({ count: 3 }, deterministicEnv()), ['root', 'list', 'item', 'trigger', 'indicator', 'separator', 'content', 'completed']],
      [createToastController({}, deterministicEnv()), ['viewport', 'root', 'title', 'description', 'action', 'close']],
    ] as const;
    for (const [controller, anatomy] of controllers) {
      expect(Object.keys(controller.parts)).toEqual(anatomy);
      expect(controller.status).toBe('running');
      controller.destroy();
    }
    expect(MeterContract.anatomy.map((part) => part.name)).toEqual(['root', 'label', 'track', 'range', 'valueText']);
    expect(ProgressContract.anatomy.map((part) => part.name)).toEqual(['root', 'label', 'track', 'range', 'circle', 'valueText']);
  });
});

describe('TV-PRIM-006-P/N range and gesture rigor', () => {
  it('handles precision, RTL axes, Page/Home/End, collision, locale text, multi-pointer, cancel, and touch arbitration', () => {
    const slider = createSliderController({ defaultValue: [0.2, 0.8], min: 0, max: 1, step: 0.1, minStepsBetweenThumbs: 2, dir: 'rtl', locale: 'de-DE' }, deterministicEnv('de-DE', 'rtl'));
    slider.actions.keyStep(0, 'ArrowRight');
    expect(slider.state.value).toEqual([0.1, 0.8]);
    slider.actions.keyStep(0, 'PageUp');
    expect(slider.state.value).toEqual([0.6, 0.8]);
    slider.actions.keyStep(0, 'End');
    expect(slider.state.value).toEqual([0.6, 0.8]);
    expect(slider.state.valueText[0]).toBe('0,6');

    slider.actions.pointerStart(11, 20, 'mouse');
    slider.actions.pointerStart(12, 80, 'pen');
    expect(Object.keys(slider.state.pointers)).toHaveLength(2);
    slider.actions.pointerCancel(11);
    const afterCancel = slider.state.value;
    slider.actions.pointerMove(11, 99);
    expect(slider.state.value).toEqual(afterCancel);
    assertUIFnCancelledGesture(slider, 11);
    slider.actions.lostPointerCapture(12);
    expect(slider.state.interaction).toBe('idle');

    slider.actions.pointerStart(13, 50, 'touch');
    slider.actions.pointerMove(13, 55, { x: 50, y: 70 });
    expect(slider.state.cancelledPointers).toContain(13);
    expect(resolveUIFnAxisPercent({ x: 25, y: 0 }, { left: 0, top: 0, width: 100, height: 100 }, 'horizontal', 'rtl')).toBe(75);
    slider.destroy();
  });

  it('covers angle, carousel reduced motion, rating, signature cancel, and splitter conservation', () => {
    const angle = createAngleSliderController({ defaultValue: 0, step: 15, locale: 'hi-IN' }, deterministicEnv('hi-IN'));
    angle.actions.keyStep('PageUp');
    expect(angle.state.value).toBe(150);
    angle.actions.pointerStart(1, 90, 'touch'); angle.actions.lostPointerCapture(1); angle.actions.pointerMove(1, 180);
    expect(angle.state.value).toBe(90);

    const carousel = createCarouselController({ itemCount: 3, autoplayDelay: 10, reducedMotion: true, loop: true }, deterministicEnv());
    expect(carousel.state.interaction).toBe('idle');
    carousel.actions.dragStart(1, { x: 100, y: 0 }, 'touch'); carousel.actions.dragMove(1, { x: 50, y: 2 }); carousel.actions.dragEnd(1);
    expect(carousel.state.index).toBe(1);

    const rating = createRatingGroupController({ allowHalf: true, defaultValue: 2.5, locale: 'hi-IN' }, deterministicEnv('hi-IN'));
    rating.actions.keyStep('ArrowRight'); expect(rating.state.value).toBe(3);

    const signature = createSignaturePadController({}, deterministicEnv());
    signature.actions.pointerStart(1, { x: 0, y: 0, pressure: 0.5, time: 0 });
    signature.actions.pointerStart(2, { x: 2, y: 2, pressure: 1, time: 0 });
    signature.actions.pointerCancel(1); signature.actions.pointerEnd(2);
    expect(signature.state.strokes).toHaveLength(1); expect(signature.state.cancelledPointers).toEqual([1]);

    const splitter = createSplitterController({ defaultSizes: [40, 60], minSizes: [20, 20], maxSizes: [80, 80], dir: 'rtl' }, deterministicEnv('ar-EG', 'rtl'));
    splitter.actions.resize(0, 10); expect(splitter.state.sizes).toEqual([30, 70]);
    expect(splitter.state.sizes.reduce((sum, value) => sum + value, 0)).toBe(100);
    angle.destroy(); carousel.destroy(); rating.destroy(); signature.destroy(); splitter.destroy();
  });

  it('negative classifier names wrong RTL behavior precisely', () => {
    expect(() => assertUIFnRangeDirection(60, 40, { vector: 'TV-PRIM-006-N' })).toThrowError(expect.objectContaining({ code: 'UIFN_RANGE_DIRECTION_INVALID' }));
  });
});

describe('TV-PRIM-007-P/N structured date, color, and clock models', () => {
  it('detects DST gap/fold without host parsing and preserves structured locale calendar values', () => {
    const gap = resolveUIFnZonedDateTime({ ...createUIFnCalendarDate(2024, 3, 10), hour: 2, minute: 30 }, 'America/New_York');
    const fold = resolveUIFnZonedDateTime({ ...createUIFnCalendarDate(2024, 11, 3), hour: 1, minute: 30 }, 'America/New_York');
    expect(gap.kind).toBe('gap');
    expect(fold.kind).toBe('fold');
    expect(fold.instants).toHaveLength(2);
    expect(parseUIFnIsoDate('2024-02-29')).toEqual({ calendar: 'gregory', year: 2024, month: 2, day: 29 });
    expect(() => parseUIFnIsoDate('02/29/2024')).toThrowError(expect.objectContaining({ code: 'UIFN_AMBIENT_DATE_PARSE' }));
    expect(firstUIFnDayOfWeek('de-DE')).toBe(1);

    const input = createDateInputController({ defaultValue: createUIFnCalendarDate(2024, 2, 29), locale: 'ja-JP', calendar: 'japanese', min: createUIFnCalendarDate(2024, 1, 1), max: createUIFnCalendarDate(2024, 12, 31) }, deterministicEnv('ja-JP'));
    input.actions.editSegment('year', 2023);
    expect(input.state.value).toEqual(createUIFnCalendarDate(2023, 2, 28));
    expect(input.state.valid).toBe(false);
    expect(input.state.message).toBe('');

    const picker = createDatePickerController({ defaultValue: createUIFnCalendarDate(2024, 3, 8), locale: 'de-DE', unavailable: (date) => date.day === 9 }, deterministicEnv('de-DE'));
    picker.actions.navigateGrid('ArrowRight');
    expect(picker.state.focusedDate).toEqual(createUIFnCalendarDate(2024, 3, 10));
    expect(picker.state.grid).toHaveLength(42);
    input.destroy(); picker.destroy();
  });

  it('clamps color channels and round-trips supported spaces and alpha within one byte', () => {
    const source = parseUIFnColor('#33aaff80');
    const hsl = rgbaToUIFnHsla(source);
    const roundTrip = hslaToUIFnRgba(hsl);
    expect(colorUIFnDistance(source, roundTrip)).toBeLessThanOrEqual(1);
    const picker = createColorPickerController({ defaultValue: '#33aaff80', colorSpace: 'hsl', alpha: true }, deterministicEnv());
    picker.actions.setChannel('h', 720);
    expect(picker.state.channels.h).toBeLessThanOrEqual(360);
    expect(picker.state.roundTripError).toBeLessThanOrEqual(1);
    expect(picker.state.value.alpha).toBeCloseTo(128 / 255, 4);
    picker.destroy();

    const keyboardPicker = createColorPickerController({ defaultValue: '#33669980', colorSpace: 'srgb', alpha: true }, deterministicEnv());
    const redSlider = keyboardPicker.parts.channelSlider.getProps('r');
    expect(redSlider.tabIndex).toBe(0);
    const redBefore = Number(redSlider.aria?.valuenow);
    const preventDefault = vi.fn();
    redSlider.on?.keydown?.({ key: 'ArrowRight', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(keyboardPicker.state.channels.r).toBe(redBefore + 1);

    keyboardPicker.parts.channelSlider.getProps('alpha').on?.keydown?.({ key: 'End', preventDefault: vi.fn() });
    expect(keyboardPicker.state.channels.alpha).toBe(1);
    keyboardPicker.parts.channelSlider.getProps('alpha').on?.keydown?.({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(keyboardPicker.state.channels.alpha).toBe(1);
    keyboardPicker.parts.channelSlider.getProps('alpha').on?.keydown?.({ key: 'Home', preventDefault: vi.fn() });
    expect(keyboardPicker.state.channels.alpha).toBe(0);

    const saturationBefore = rgbaToUIFnHsla(keyboardPicker.state.value).s;
    const areaThumb = keyboardPicker.parts.areaThumb.getProps();
    expect(areaThumb.tabIndex).toBe(0);
    areaThumb.on?.keydown?.({ key: 'ArrowLeft', preventDefault: vi.fn() });
    expect(rgbaToUIFnHsla(keyboardPicker.state.value).s).toBeLessThan(saturationBefore);
    keyboardPicker.destroy();
  });

  it('derives elapsed time from injected now across pause, visibility, drift, completion, and destroy', () => {
    const scheduler = createManualRuntimeScheduler(1000); const complete = vi.fn();
    const timer = createTimerController({ duration: 10_000, announceInterval: 1000, onComplete: complete }, { scheduler, now: scheduler.now, locale: 'de-DE' });
    timer.actions.start(); scheduler.advanceBy(3333); timer.actions.tick();
    expect(timer.state.remaining).toBe(6667);
    timer.actions.visibilityChange(true); scheduler.advanceBy(5000); expect(timer.state.remaining).toBe(6667);
    timer.actions.visibilityChange(false); scheduler.advanceBy(6667);
    expect(timer.state.remaining).toBe(0); expect(complete).toHaveBeenCalledOnce();
    expect(timer.state.announcementCount).toBeLessThanOrEqual(11);
    timer.destroy(); scheduler.advanceBy(1000); expect(complete).toHaveBeenCalledOnce(); expect(scheduler.pending().timeout).toBe(0);
  });

  it('rejects non-finite timer inputs before they can enter a runtime snapshot', () => {
    expect(() => createTimerController({ duration: Number.POSITIVE_INFINITY }, deterministicEnv())).toThrowError(
      expect.objectContaining({ code: 'UIFN_ERR_INVALID_VALUE' }),
    );
  });
});

describe('TV-PRIM-008-P/N status, workflow, queue, and lifecycle', () => {
  it('publishes native/ARIA determinate, indeterminate, meter, steps, and tree workflow state', () => {
    const meter = MeterContract.getParts({ value: 90, max: 100, low: 30, high: 70, optimum: 10, locale: 'de-DE' }, { scopeId: 'meter' });
    expect(meter.root.role).toBe('meter'); expect(meter.root.aria?.valuenow).toBe(90); expect(meter.root.data?.state).toBe('critical');
    const indeterminate = ProgressContract.getParts({ value: null }, { scopeId: 'progress' });
    expect(indeterminate.root.aria?.valuenow).toBeUndefined();
    const complete = ProgressContract.getParts({ value: 100, max: 100 }, { scopeId: 'progress-complete' });
    expect(complete.root.data?.state).toBe('complete');

    const steps = createStepsController({ count: 4, defaultStep: 1, errors: [3], locale: 'hi-IN' }, deterministicEnv('hi-IN'));
    expect(steps.parts.item.getProps(1).aria?.current).toBe('step'); expect(steps.parts.item.getProps(3).data?.state).toBe('error');
    const completedSteps = createStepsController({ count: 3, defaultStep: 2, locale: 'de-DE' }, deterministicEnv('de-DE'));
    completedSteps.actions.complete(); expect(completedSteps.state.status).toBe('complete'); expect(completedSteps.state.statuses).toEqual(['complete', 'complete', 'complete']);
    const tree = createTreeViewController({ items: [{ id: 'build', status: 'current' }, { id: 'ship', status: 'pending' }] }, deterministicEnv());
    expect(tree.parts.item.getProps('build').aria?.current).toBe('step'); tree.actions.setStatus('ship', 'error'); expect(tree.parts.item.getProps('ship').aria?.invalid).toBe(true);
    steps.destroy(); completedSteps.destroy(); tree.destroy();
  });

  it('enforces toast limit, duplicate policy, deadline pause, swipe, announcement order, callbacks, route cleanup, and destroy', () => {
    const scheduler = createManualRuntimeScheduler(); const callbacks: string[] = [];
    const toast = createToastController({ limit: 2, duration: 1000, duplicatePolicy: 'ignore', toasts: [{ id: 'a' }, { id: 'b', politeness: 'assertive' }, { id: 'c' }], onDismiss: (id, reason) => callbacks.push(`dismiss:${id}:${reason}`), onRemove: (id) => callbacks.push(`remove:${id}`) }, { scheduler, now: scheduler.now });
    expect(toast.state.visible.map((item) => item.id)).toEqual(['a', 'b']); expect(toast.state.queued.map((item) => item.id)).toEqual(['c']);
    const close = toast.parts.close.getProps('a', { aria: { label: 'Close' } });
    expect(close.aria).toMatchObject({
      controls: toast.parts.root.getProps('a').id,
      label: 'Dismiss notification',
    });
    expect(close.warnings).toContain('UIFN_PART_INVARIANT_OVERRIDDEN');
    toast.actions.add({ id: 'a' }); expect(toast.state.visible).toHaveLength(2);
    toast.actions.pause('window'); scheduler.advanceBy(5000); expect(toast.state.visible).toHaveLength(2);
    toast.actions.resume('window'); toast.actions.swipeStart('a'); toast.actions.swipeMove('a', 50); toast.actions.swipeEnd('a');
    expect(toast.state.visible.map((item) => item.id)).toEqual(['b', 'c']);
    expect(callbacks.slice(0, 2)).toEqual(['dismiss:a:swipe', 'remove:a']);
    expect(toast.state.announcements.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    toast.actions.routeChange(); expect(toast.state.visible).toEqual([]); expect(toast.state.queued).toEqual([]);
    const count = callbacks.length; toast.destroy(); scheduler.advanceBy(5000); expect(callbacks).toHaveLength(count); expect(scheduler.pending().timeout).toBe(0);
  });

  it('represents persistent toast deadlines with a serializable null sentinel', () => {
    const scheduler = createManualRuntimeScheduler();
    const toast = createToastController({ toasts: [{ id: 'persistent', duration: Number.POSITIVE_INFINITY }] }, { scheduler, now: scheduler.now });
    expect(toast.state.visible[0]).toMatchObject({ id: 'persistent', duration: null, remaining: null });
    expect(JSON.parse(JSON.stringify(toast.state)).visible[0].remaining).toBeNull();
    expect(scheduler.pending().timeout).toBe(0);
    toast.destroy();
  });

  it('negative policies fail with the exact announcement and stale-timer codes', () => {
    expect(() => assertUIFnAnnouncementBudget(11, 10)).toThrowError(expect.objectContaining({ code: 'UIFN_ANNOUNCEMENT_FLOOD' }));
    expect(() => assertUIFnNoTimerAfterDestroy(1)).toThrowError(expect.objectContaining({ code: 'UIFN_TIMER_AFTER_DESTROY' }));
  });
});

describe('TV-I18N-001-P/N cross-catalog scenarios', () => {
  it('covers Arabic RTL, Hindi digits, Japanese structured display, and European number/date rules without core English sentences', () => {
    const rtl = createSliderController({ defaultValue: [50], dir: 'rtl', locale: 'ar-EG' }, deterministicEnv('ar-EG', 'rtl'));
    rtl.actions.keyStep(0, 'ArrowRight'); expect(rtl.state.value).toEqual([49]); expect(rtl.state.valueText[0]).not.toBe('49');
    const hindi = createAngleSliderController({ defaultValue: 45, locale: 'hi-IN' }, deterministicEnv('hi-IN')); expect(hindi.state.valueText).toContain('45');
    const japanese = createDateInputController({ defaultValue: createUIFnCalendarDate(2024, 1, 2), locale: 'ja-JP', calendar: 'japanese', messages: { invalid: '無効' } }, deterministicEnv('ja-JP')); expect(japanese.state.displayValue).toBeTruthy();
    const european = createDatePickerController({ defaultValue: createUIFnCalendarDate(2024, 1, 2), locale: 'de-DE' }, deterministicEnv('de-DE')); expect(firstUIFnDayOfWeek(european.state.locale)).toBe(1);
    expect(() => assertUIFnRangeDirection(49, 51, { vector: 'TV-I18N-001-N' })).toThrowError(expect.objectContaining({ code: 'UIFN_RANGE_DIRECTION_INVALID' }));
    rtl.destroy(); hindi.destroy(); japanese.destroy(); european.destroy();
  });
});
