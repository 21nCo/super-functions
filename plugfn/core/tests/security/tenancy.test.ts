import { describe, expect, it } from 'vitest';
import {
  connectionMatchesActor,
  hasAny,
  tenantMatches,
} from '../../src/security/tenancy.js';
import { ConnectionStatus } from '../../src/types/connection.js';

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

  it('requires an operation-specific grant for delegated access', () => {
    const connection = {
      id: 'conn-delegated',
      userId: 'installer',
      provider: 'gmail',
      ownerKind: 'delegated' as const,
      ownerId: 'delegate',
      installedByUserId: 'installer',
      delegatedToUserId: 'delegate',
      grants: ['sync'],
      tenantId: 'tenant-1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const actor = { userId: 'delegate', tenantId: 'tenant-1' };

    expect(connectionMatchesActor(connection, actor, 'sync')).toBe(true);
    expect(connectionMatchesActor(connection, actor, 'disconnect')).toBe(false);
    expect(
      connectionMatchesActor(
        { ...connection, grants: ['revoke'] },
        actor,
        'disconnect'
      )
    ).toBe(true);
  });
});
