import { describe, expect, it } from 'vitest';
import { SeparatorContract } from './separator';

describe('separator static contract', () => {
  it('uses separator semantics by default without runtime lifecycle fields', () => {
    expect(SeparatorContract.getState({})).toEqual({ orientation: 'horizontal', decorative: false, status: 'ready' });
    expect(SeparatorContract.getParts({}, { scopeId: 'section' }).root.role).toBe('separator');
    expect('subscribe' in SeparatorContract).toBe(false);
  });

  it('uses presentation semantics when decorative', () => {
    const root = SeparatorContract.getParts({ orientation: 'vertical', decorative: true }, { scopeId: 'section' }).root;
    expect(root.role).toBe('presentation');
    expect(root.aria?.hidden).toBe(true);
  });
});
