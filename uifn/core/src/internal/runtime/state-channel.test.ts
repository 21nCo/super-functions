import { describe, expect, it, vi } from 'vitest';
import { createStateChannel } from './state-channel';

describe('state channel semantic no-ops', () => {
  it('does not publish shallow-equal patches from re-entrant DOM projections', () => {
    const channel = createStateChannel({ open: false, focusedItem: 'item' });
    const listener = vi.fn(() => channel.patchState({ focusedItem: 'item' }));
    const release = channel.subscribe(listener);

    channel.patchState({ open: true });

    expect(channel.getState()).toEqual({ open: true, focusedItem: 'item' });
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    channel.destroy();
  });

  it('preserves a re-entrant transition back to the currently published value', () => {
    const channel = createStateChannel({ open: false, phase: 'closed', returnFocusId: null as string | null });
    const observations: Array<ReturnType<typeof channel.getState>> = [];
    let projectedPresence = false;
    const release = channel.subscribe((state) => {
      observations.push(state);
      if (!projectedPresence && state.open) {
        projectedPresence = true;
        channel.patchState({ phase: 'opening' });
        channel.patchState({ phase: 'open' });
        channel.patchState({ returnFocusId: 'dialog-trigger' });
      }
    });

    channel.patchState({ open: true, phase: 'open' });

    expect(channel.getState()).toEqual({
      open: true,
      phase: 'open',
      returnFocusId: 'dialog-trigger',
    });
    expect(observations.map(({ phase, returnFocusId }) => ({ phase, returnFocusId }))).toEqual([
      { phase: 'open', returnFocusId: null },
      { phase: 'opening', returnFocusId: null },
      { phase: 'open', returnFocusId: null },
      { phase: 'open', returnFocusId: 'dialog-trigger' },
    ]);
    release();
    channel.destroy();
  });
});
