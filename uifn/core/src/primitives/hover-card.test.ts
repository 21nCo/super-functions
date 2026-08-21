import { describe, expect, it } from 'vitest';
import { createHoverCardController } from './hover-card';

describe('hover-card primitive', () => {
  it('applies open/close delays deterministically', () => {
    const hoverCard = createHoverCardController({
      openDelay: 200,
      closeDelay: 100,
    });

    hoverCard.actions.openWithDelay();
    hoverCard.actions.advanceTime(199);
    expect(hoverCard.state.open).toBe(false);
    hoverCard.actions.advanceTime(1);
    expect(hoverCard.state.open).toBe(true);

    hoverCard.actions.closeWithDelay();
    hoverCard.actions.cancelClose();
    hoverCard.actions.advanceTime(100);
    expect(hoverCard.state.open).toBe(true);

    hoverCard.actions.onContentPointerLeave();
    hoverCard.actions.advanceTime(100);
    expect(hoverCard.state.open).toBe(false);
    expect(hoverCard.state.policy.hoverableContent).toBe(true);
    expect(hoverCard.state.policy.touchOpens).toBe(false);
  });
});
