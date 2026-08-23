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
});
