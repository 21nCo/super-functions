import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSveltePartAction } from '../lib/internal/props.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Svelte part action reconciliation', () => {
  it('preserves focus while reactive part attributes are updated', () => {
    const node = document.createElement('div');
    document.body.append(node);
    const registered: Array<HTMLElement | null> = [];
    const action = createSveltePartAction((value) => registered.push(value))(node, {
      id: 'date-input-segment',
      tabIndex: 0,
      data: { state: 'idle' },
    });

    node.focus();
    expect(document.activeElement).toBe(node);

    action.update({
      id: 'date-input-segment',
      tabIndex: 0,
      data: { state: 'focused' },
    });

    expect(document.activeElement).toBe(node);
    expect(node.tabIndex).toBe(0);
    expect(node.dataset.state).toBe('focused');
    expect(registered).toEqual([node]);

    action.destroy();
    expect(registered).toEqual([node, null]);
  });

  it('rebinds events without retaining stale handlers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const node = document.createElement('button');
    document.body.append(node);
    const action = createSveltePartAction(() => undefined)(node, {
      on: { click: first },
    });

    node.click();
    action.update({ on: { click: second } });
    node.click();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    action.destroy();
  });
});
