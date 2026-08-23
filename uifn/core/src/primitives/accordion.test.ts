import { describe, expect, it, vi } from 'vitest';
import { UIFnError } from '../errors';
import { createAccordionRuntime } from './accordion';

describe('accordion primitive', () => {
  it('supports deterministic disclosure transitions and roving focus', () => {
    const accordion = createAccordionRuntime({
      type: 'single',
      defaultValue: 'item-1',
      collapsible: true,
      items: ['item-1', 'item-2'],
    });

    const stateSequence: Array<string | string[]> = [accordion.state.value];
    const focusSequence: string[] = [accordion.state.focusedItem ?? ''];

    const nextItem = accordion.actions.handleKeyDown('ArrowDown', 'item-1');
    focusSequence.push(accordion.state.focusedItem ?? '');

    accordion.actions.toggleItem(nextItem ?? 'item-2');
    stateSequence.push(accordion.state.value);
    focusSequence.push(accordion.state.focusedItem ?? '');

    accordion.actions.toggleItem(nextItem ?? 'item-2');
    stateSequence.push(accordion.state.value);

    expect(stateSequence).toEqual(['item-1', 'item-2', '']);
    expect(focusSequence).toEqual(['item-1', 'item-2', 'item-2']);
  });

  it('throws deterministic invalid value errors for unknown controlled values', () => {
    expect(
      () =>
        createAccordionRuntime({
          type: 'single',
          value: 'item-9',
          items: ['item-1', 'item-2'],
        })
    ).toThrowError(UIFnError);
  });

  it('keeps controlled accordion value stable until syncValue runs', () => {
    const onValueChange = vi.fn();
    const accordion = createAccordionRuntime({
      type: 'single',
      value: 'item-1',
      onValueChange,
      collapsible: true,
      items: ['item-1', 'item-2'],
    });

    accordion.actions.toggleItem('item-2');
    expect(onValueChange).toHaveBeenCalledWith('item-2');
    expect(accordion.state.value).toBe('item-1');

    accordion.actions.syncValue('item-2');
    expect(accordion.state.value).toBe('item-2');
  });
});
