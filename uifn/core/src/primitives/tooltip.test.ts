import { describe, expect, it } from 'vitest';
import { createTooltipController } from './tooltip';

describe('tooltip primitive', () => {
  it('opens after deterministic hover delay while focus is immediate and touch is ignored', () => {
    const tooltip = createTooltipController({
      delayDuration: 700,
      defaultOpen: false,
    });

    tooltip.actions.openWithDelay();
    expect(tooltip.state.open).toBe(false);
    expect(tooltip.state.pendingOpenMs).toBe(700);

    tooltip.actions.advanceTime(699);
    expect(tooltip.state.open).toBe(false);
    expect(tooltip.state.pendingOpenMs).toBe(1);

    tooltip.actions.advanceTime(1);
    expect(tooltip.state.open).toBe(true);
    expect(tooltip.state.pendingOpenMs).toBe(null);
    tooltip.actions.close();
    expect(tooltip.state.open).toBe(false);
    tooltip.actions.onTriggerPointerEnter('touch');
    tooltip.actions.advanceTime(700);
    expect(tooltip.state.open).toBe(false);
    tooltip.actions.onTriggerFocus();
    expect(tooltip.state.open).toBe(true);
    expect(tooltip.parts.trigger.getProps().aria?.describedby).toBe(tooltip.state.ids.contentId);
  });

  it('declares bottom positioning for the shared DOM positioner', () => {
    const tooltip = createTooltipController({
      side: 'bottom',
      delayDuration: 700,
    });

    expect(tooltip.state.policy.position).toBe('anchor');
    expect(tooltip.state.placement).toBe('bottom');
    expect('computePosition' in tooltip.actions).toBe(false);
  });
});
