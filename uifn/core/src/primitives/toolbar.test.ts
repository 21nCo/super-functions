import { describe, expect, it } from 'vitest';
import { createToolbarRuntime } from './toolbar';

describe('toolbar primitive', () => {
  it('tracks orientation navigation and grouping semantics', () => {
    const toolbar = createToolbarRuntime({
      orientation: 'vertical',
      items: [
        { id: 'cut', group: 'edit' },
        { id: 'copy', group: 'edit' },
        { id: 'paste', group: 'edit', disabled: true },
        { id: 'help', group: 'meta' },
      ],
    });

    expect(toolbar.state.focusedItem).toBe('cut');
    const next = toolbar.actions.handleKeyDown('ArrowDown', 'cut');
    expect(next).toBe('copy');
    expect(toolbar.actions.getGroupItems('edit')).toEqual(['cut', 'copy', 'paste']);
  });
});
