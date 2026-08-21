import { describe, expect, it } from 'vitest';
import { createAdminRegistry } from '@superfunctions/admin';
import { extFnAdminAdapter, extFnAdminCapability } from '../index.js';

describe('@extfn/admin', () => {
  it('declares an explicit unavailable state without exposing operations', () => {
    expect(extFnAdminCapability.availability).toBe('unavailable');
    expect(extFnAdminCapability.unavailableReason).toContain('no server-side extension lifecycle');
    expect(extFnAdminCapability.operations).toEqual([]);
    expect(extFnAdminCapability.navigation).toBeUndefined();
  });

  it('cannot be enabled in an administration registry', () => {
    expect(() => createAdminRegistry({
      adapters: [extFnAdminAdapter],
      enabledModules: ['extfn']
    })).toThrow('not domain-backed and cannot be enabled');
  });
});
