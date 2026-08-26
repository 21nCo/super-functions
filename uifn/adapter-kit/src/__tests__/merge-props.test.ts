import { describe, expect, it, vi } from 'vitest';
import {
  mergeEventHandlers,
  mergeProps,
  normalizeAriaAttributes,
  normalizeDataAttributes,
  toCssStyleEntries,
  toCssStyleString,
} from '../merge-props';

describe('merge-props utilities', () => {
  it('composes event callbacks in declaration order', () => {
    const calls: string[] = [];
    const first = vi.fn(() => calls.push('first'));
    const second = vi.fn(() => calls.push('second'));
    const handler = mergeEventHandlers(first, second);

    handler?.({ type: 'click' });

    expect(calls).toEqual(['first', 'second']);
  });

  it('merges classes, styles, aria, data, on, and event props', () => {
    const calls: string[] = [];
    const firstClick = vi.fn(() => calls.push('first-click'));
    const secondClick = vi.fn(() => calls.push('second-click'));
    const firstPointer = vi.fn(() => calls.push('first-pointer'));
    const secondPointer = vi.fn(() => calls.push('second-pointer'));

    const merged = mergeProps(
      {
        className: 'root selected',
        style: { color: 'red', opacity: 0.8 },
        aria: { expanded: false },
        data: { state: 'closed' },
        on: { click: firstClick },
        onPointerDown: firstPointer,
      },
      {
        className: 'selected active',
        style: { color: 'blue' },
        aria: { expanded: true, controls: 'content' },
        data: { state: 'open', disabled: false },
        on: { click: secondClick },
        onPointerDown: secondPointer,
      }
    );

    (merged.on?.click as ((event: { type: string }) => void) | undefined)?.({ type: 'click' });
    (merged.onPointerDown as (event: { type: string }) => void)({ type: 'pointerdown' });

    expect(merged.className).toBe('root selected selected active');
    expect(merged.style).toEqual({ color: 'blue', opacity: 0.8 });
    expect(merged.aria).toEqual({ expanded: true, controls: 'content' });
    expect(merged.data).toEqual({ state: 'open', disabled: false });
    expect(calls).toEqual(['first-click', 'second-click', 'first-pointer', 'second-pointer']);
  });

  it('normalizes data and aria attributes for host frameworks', () => {
    expect(
      normalizeDataAttributes({
        state: 'open',
        disabled: false,
        highlighted: true,
        sideOffset: 4,
      })
    ).toEqual({
      'data-state': 'open',
      'data-highlighted': '',
      'data-side-offset': '4',
    });

    expect(
      normalizeAriaAttributes({
        expanded: true,
        controls: 'content',
      })
    ).toEqual({
      'aria-expanded': true,
      'aria-controls': 'content',
    });
  });

  it('normalizes framework-neutral style values to browser CSS semantics', () => {
    expect(toCssStyleEntries({
      insetInlineStart: 12,
      opacity: 0.5,
      zIndex: 10,
      '--uifn-anchor-width': 'var(--reference-width)',
    })).toEqual([
      ['inset-inline-start', '12px'],
      ['opacity', '0.5'],
      ['z-index', '10'],
      ['--uifn-anchor-width', 'var(--reference-width)'],
    ]);
    expect(toCssStyleString({ pointerEvents: 'none', top: 0 })).toBe('pointer-events:none;top:0');
  });
});
