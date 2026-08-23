import { describe, expect, it } from 'vitest';
import { createScrollAreaRuntime } from './scroll-area';

describe('scroll-area primitive', () => {
  it('keeps viewport and vertical thumb synchronized', () => {
    const scrollArea = createScrollAreaRuntime({});
    scrollArea.actions.setViewportMetrics({
      scrollHeight: 2000,
      clientHeight: 200,
      scrollWidth: 200,
      clientWidth: 200,
    });

    scrollArea.actions.dragVerticalThumb(50);
    expect(scrollArea.state.viewport.scrollTop).toBe(900);
    expect(scrollArea.state.vertical.thumbPositionPercent).toBe(50);
    expect(scrollArea.state.cornerVisible).toBe(false);

    scrollArea.actions.onViewportScroll({ top: 900 });
    expect(scrollArea.state.vertical.thumbPositionPercent).toBe(50);
  });

  it('shows corner only when both axes overflow', () => {
    const scrollArea = createScrollAreaRuntime({});
    scrollArea.actions.setViewportMetrics({
      scrollHeight: 1000,
      clientHeight: 200,
      scrollWidth: 1200,
      clientWidth: 300,
    });

    expect(scrollArea.state.vertical.visible).toBe(true);
    expect(scrollArea.state.horizontal.visible).toBe(true);
    expect(scrollArea.state.cornerVisible).toBe(true);
  });

  it('keeps programmatic scroll paths consistent with thumb sync', () => {
    const scrollArea = createScrollAreaRuntime({});
    scrollArea.actions.setViewportMetrics({
      scrollHeight: 2000,
      clientHeight: 200,
      scrollWidth: 1200,
      clientWidth: 300,
    });

    scrollArea.actions.scrollTo({ top: 900, left: 450 });
    expect(scrollArea.state.vertical.thumbPositionPercent).toBe(50);
    expect(scrollArea.state.horizontal.thumbPositionPercent).toBe(50);

    scrollArea.actions.dragHorizontalThumb(50);
    expect(scrollArea.state.viewport.scrollLeft).toBe(450);
  });
});
