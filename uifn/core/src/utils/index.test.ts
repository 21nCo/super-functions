import { describe, expect, it } from 'vitest';
import * as utils from './index';

describe('utils public barrel', () => {
  it('exports only framework-free id utilities', () => {
    expect('generateId' in utils).toBe(false);
    expect(typeof utils.createDeterministicIdFactory).toBe('function');
    expect(typeof utils.createIdFactory).toBe('function');
    expect('createFocusTrap' in utils).toBe(false);
    expect('getNextRovingFocusIndex' in utils).toBe(false);
    expect('createOutsideClickListener' in utils).toBe(false);
    expect('createEscapeKeyListener' in utils).toBe(false);
    expect('resolvePresenceState' in utils).toBe(false);
    expect('resolvePortalTarget' in utils).toBe(false);
    expect('computePosition' in utils).toBe(false);
  });
});
