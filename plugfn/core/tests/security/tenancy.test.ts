import { describe, expect, it } from 'vitest';
import { hasAny, tenantMatches } from '../../src/security/tenancy.js';

describe('tenant matching', () => {
  it('fails closed when only one side is tenant scoped', () => {
    expect(tenantMatches('tenant-1', undefined)).toBe(false);
    expect(tenantMatches(undefined, 'tenant-1')).toBe(false);
  });

  it('allows equal tenant scopes and legacy unscoped records', () => {
    expect(tenantMatches('tenant-1', 'tenant-1')).toBe(true);
    expect(tenantMatches(undefined, undefined)).toBe(true);
    expect(tenantMatches('tenant-1', 'tenant-2')).toBe(false);
  });

  it('fails closed for corrupted persisted role and grant metadata', () => {
    expect(hasAny('org:admin', ['org:admin'])).toBe(false);
    expect(hasAny({ role: 'org:admin' }, ['org:admin'])).toBe(false);
    expect(hasAny(['viewer', 1, null], ['org:admin'])).toBe(false);
    expect(hasAny(['viewer', 'org:admin'], ['org:admin'])).toBe(true);
  });
});
