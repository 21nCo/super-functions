import { describe, expect, it } from 'vitest';
import { createAdminRegistry } from '@superfunctions/admin';
import { cliFnAdminAdapter, cliFnAdminCapability } from '../index.js';

describe('@clifn/admin', () => {
  it('declares an explicit unavailable state without exposing operations', () => {
    expect(cliFnAdminCapability.availability).toBe('unavailable');
    expect(cliFnAdminCapability.unavailableReason).toContain('no server-side operator service');
    expect(cliFnAdminCapability.operations).toEqual([]);
    expect(cliFnAdminCapability.navigation).toBeUndefined();
  });

  it('cannot be enabled in an administration registry', () => {
    expect(() => createAdminRegistry({
      adapters: [cliFnAdminAdapter],
      enabledModules: ['clifn']
    })).toThrow('not domain-backed and cannot be enabled');
  });
});
