import { describe, expect, it } from 'vitest';
import { createSliderController } from './slider';

describe('slider primitive', () => {
  it('uses exact multi-thumb collision and keyboard rules', () => {
    const slider = createSliderController({ defaultValue: [20, 80], min: 0, max: 100, step: 10, minStepsBetweenThumbs: 2 });
    slider.actions.keyStep(0, 'PageUp');
    expect(slider.state.value).toEqual([60, 80]);
    slider.actions.keyStep(0, 'End');
    expect(slider.state.value).toEqual([60, 80]);
    slider.actions.keyStep(1, 'Home');
    expect(slider.state.value).toEqual([60, 80]);
    slider.destroy();
  });

  it('terminates cancelled and lost-capture pointers', () => {
    const slider = createSliderController({ defaultValue: [20] });
    expect(slider.parts.range.getProps().style).toMatchObject({
      insetInlineStart: '0%',
      width: '20%',
    });
    slider.actions.pointerStart(1, 40, 'mouse');
    slider.actions.lostPointerCapture(1);
    const cancelled = slider.state.value;
    slider.actions.pointerMove(1, 90);
    expect(slider.state.value).toEqual(cancelled);
    expect(slider.state.interaction).toBe('idle');
    slider.destroy();
  });

  it('back-propagates thumb spacing from the upper bound', () => {
    const slider = createSliderController({
      defaultValue: [95, 100],
      min: 0,
      max: 100,
      step: 1,
      minStepsBetweenThumbs: 10,
    });
    expect(slider.state.value).toEqual([90, 100]);
    slider.destroy();
  });

  it('synchronizes mutable constraints and interaction props on update', () => {
    const slider = createSliderController({ defaultValue: [20, 80] });
    slider.update({
      value: [45, 50],
      min: 0,
      max: 50,
      step: 5,
      minStepsBetweenThumbs: 2,
      orientation: 'vertical',
      dir: 'rtl',
      locale: 'de-DE',
      name: 'updated-range',
      disabled: true,
      readOnly: true,
    });
    expect(slider.state).toMatchObject({
      value: [40, 50],
      min: 0,
      max: 50,
      step: 5,
      minStepsBetweenThumbs: 2,
      orientation: 'vertical',
      dir: 'rtl',
      locale: 'de-DE',
      disabled: true,
      readOnly: true,
    });
    expect(slider.parts.thumb.getProps(0)).toMatchObject({
      tabIndex: -1,
      aria: { valuemax: 40, orientation: 'vertical', disabled: true, readonly: true },
    });
    expect(slider.parts.hiddenInput.getProps(0)).toMatchObject({
      attributes: { name: 'updated-range', disabled: true },
    });
    slider.actions.keyStep(0, 'ArrowUp');
    expect(slider.state.value).toEqual([40, 50]);
    slider.update({ value: undefined, disabled: false, readOnly: false });
    slider.actions.keyStep(0, 'ArrowDown');
    expect(slider.state.value).toEqual([35, 50]);
    slider.destroy();
  });
});
