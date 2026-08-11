import { describe, expect, it } from 'vitest';
import {
  assertScopedAccess,
  assertValidScope,
  filterScopedRecords,
  getScopedRecordById,
} from '../../src/security/isolation-guards.js';

describe('tenant and user isolation guards', () => {
  it('returns only records for the active scope', () => {
    const scoped = filterScopedRecords(
      [
        { id: 'conn_t1', tenantId: 't1', userId: 'u1' },
        { id: 'conn_t2', tenantId: 't2', userId: 'u2' },
      ],
      { tenantId: 't1', userId: 'u1' }
    );

    expect(scoped).toEqual([{ id: 'conn_t1', tenantId: 't1', userId: 'u1' }]);
  });

  it('does not reveal whether a connection id exists outside the active scope', () => {
    expect(
      getScopedRecordById(
        [
          { id: 'conn_t1', tenantId: 't1', userId: 'u1' },
          { id: 'conn_t2', tenantId: 't2', userId: 'u2' },
        ],
        'conn_t2',
        { tenantId: 't1', userId: 'u1' }
      )
    ).toBeNull();

    expect(
      getScopedRecordById(
        [
          { id: 'conn_t1', tenantId: 't1', userId: 'u1' },
          { id: 'conn_t2', tenantId: 't2', userId: 'u2' },
        ],
        'conn_missing',
        { tenantId: 't1', userId: 'u1' }
      )
    ).toBeNull();
  });

  it('returns null for unknown ids in-scope without throwing', () => {
    const record = getScopedRecordById(
      [{ id: 'conn_t1', tenantId: 't1', userId: 'u1' }],
      'conn_missing',
      { tenantId: 't1', userId: 'u1' }
    );

    expect(record).toBeNull();
  });

  it('rejects invalid scope before evaluating records', () => {
    expect(() => assertValidScope({ tenantId: '', userId: 'u1' })).toThrowError(
      'tenantId is required'
    );
    expect(() => assertValidScope({ tenantId: 't1', userId: '' })).toThrowError(
      'userId is required'
    );
  });

  it('throws canonical access denial when scope and record do not match', () => {
    expect(() =>
      assertScopedAccess(
        { tenantId: 't1', userId: 'u1' },
        { tenantId: 't2', userId: 'u2' }
      )
    ).toThrowError('cross-tenant access denied');
  });
});
