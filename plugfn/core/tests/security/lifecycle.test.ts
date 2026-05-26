import { describe, expect, it } from 'vitest';
import {
  InMemoryRetentionArtifactRepository,
  executeRetentionSweep,
  type RetentionArtifact,
} from '../../src/security/retention.js';
import {
  InMemoryLifecycleStore,
  LifecycleSecurityError,
  deleteUserScopedData,
  exportAndDeleteUserScopedData,
} from '../../src/security/export-delete.js';
import {
  ManagedMailboxSecurityError,
  ManagedMailboxSecurityService,
} from '../../src/security/e2ee-mode.js';

describe('security lifecycle controls', () => {
  it('deletes expired artifacts by policy while respecting legal holds', async () => {
    const scope = { tenantId: 't1', userId: 'u1' };
    const artifacts: RetentionArtifact[] = [
      {
        id: 'msg-old',
        tenantId: 't1',
        userId: 'u1',
        dataset: 'messages',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'msg-legal-hold',
        tenantId: 't1',
        userId: 'u1',
        dataset: 'messages',
        createdAt: '2026-01-01T00:00:00.000Z',
        legalHoldId: 'hold-1',
      },
      {
        id: 'conn-active',
        tenantId: 't1',
        userId: 'u1',
        dataset: 'connections',
        createdAt: '2026-03-10T00:00:00.000Z',
      },
    ];

    const repository = new InMemoryRetentionArtifactRepository(artifacts);
    const result = await executeRetentionSweep(
      repository,
      scope,
      {
        defaultTtlDays: 30,
        datasetTtlDays: {
          messages: 7,
        },
      },
      '2026-03-12T00:00:00.000Z'
    );

    expect(result.deleted).toBe(1);
    expect(result.deletedByDataset.messages).toBe(1);
    expect(result.deletedByDataset.connections).toBe(0);

    const remaining = await repository.listByScope(scope);
    expect(remaining.map((record) => record.id).sort()).toEqual(['conn-active', 'msg-legal-hold']);
  });

  it('exports and deletes user records across connections, tokens, messages, and parse artifacts', async () => {
    const scope = { tenantId: 't1', userId: 'u1' };
    const store = new InMemoryLifecycleStore({
      connections: [{ id: 'conn-1', tenantId: 't1', userId: 'u1' }],
      tokens: [{ id: 'token-1', tenantId: 't1', userId: 'u1' }],
      messages: [{ id: 'msg-1', tenantId: 't1', userId: 'u1' }],
      parseArtifacts: [{ id: 'parse-1', tenantId: 't1', userId: 'u1' }],
    });

    const result = await exportAndDeleteUserScopedData(scope, store, '2026-03-12T00:00:00.000Z');

    expect(result.exported).toBe(true);
    expect(result.payload.tenantId).toBe('t1');
    expect(result.payload.userId).toBe('u1');
    expect(result.payload.connections).toHaveLength(1);
    expect(result.payload.tokens).toHaveLength(1);
    expect(result.payload.messages).toHaveLength(1);
    expect(result.payload.parseArtifacts).toHaveLength(1);
    expect(result.deleted).toEqual({
      connections: true,
      tokens: true,
      messages: true,
      parseArtifacts: true,
    });

    const [connections, tokens, messages, parseArtifacts] = await Promise.all([
      store.listConnections(scope),
      store.listTokens(scope),
      store.listMessages(scope),
      store.listParseArtifacts(scope),
    ]);

    expect(connections).toHaveLength(0);
    expect(tokens).toHaveLength(0);
    expect(messages).toHaveLength(0);
    expect(parseArtifacts).toHaveLength(0);
  });

  it('fails deletion when residual token vault records remain', async () => {
    const scope = { tenantId: 't1', userId: 'u1' };
    const store = new InMemoryLifecycleStore({
      connections: [{ id: 'conn-1', tenantId: 't1', userId: 'u1' }],
      tokens: [{ id: 'token-1', tenantId: 't1', userId: 'u1' }],
      messages: [{ id: 'msg-1', tenantId: 't1', userId: 'u1' }],
      parseArtifacts: [{ id: 'parse-1', tenantId: 't1', userId: 'u1' }],
    });

    store.setResidualDataset('tokens', true);

    await expect(deleteUserScopedData(scope, store)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'deletion incomplete: token_vault_records',
    });
  });

  it('persists explicit non-recoverable mode metadata and blocks escrow recovery in that mode', () => {
    const service = new ManagedMailboxSecurityService(() => '2026-03-12T00:00:00.000Z');

    const metadata = service.setMode({
      managedMailboxId: 'mb-1',
      tenantId: 't1',
      userId: 'u1',
      mode: 'non-recoverable',
      actor: 'user-u1',
      reason: 'security-first',
    });

    expect(metadata.securityMode).toBe('non-recoverable');
    expect(metadata.serverSideRecoveryAllowed).toBe(false);
    expect(metadata.serverSideAiParsingAllowed).toBe(false);

    expect(() =>
      service.recordEscrowRecovery({
        managedMailboxId: 'mb-1',
        actor: 'oncall-1',
        reason: 'user requested reset',
      })
    ).toThrowError(ManagedMailboxSecurityError);
  });

  it('audits escrow-recoverable operations with actor and reason', () => {
    const service = new ManagedMailboxSecurityService(() => '2026-03-12T00:00:00.000Z');

    const metadata = service.setMode({
      managedMailboxId: 'mb-2',
      tenantId: 't1',
      userId: 'u1',
      mode: 'escrow-recoverable',
      actor: 'user-u1',
      reason: 'accept managed recovery',
    });

    expect(metadata.serverSideRecoveryAllowed).toBe(true);

    const event = service.recordEscrowRecovery({
      managedMailboxId: 'mb-2',
      actor: 'oncall-1',
      reason: 'identity verified and recovery approved',
    });

    expect(event).toMatchObject({
      event: 'managed-mailbox-escrow-recovery',
      managedMailboxId: 'mb-2',
      actor: 'oncall-1',
      reason: 'identity verified and recovery approved',
      securityMode: 'escrow-recoverable',
    });
  });

  it('rejects missing E2EE mode metadata', () => {
    const service = new ManagedMailboxSecurityService();

    expect(() =>
      service.setMode({
        managedMailboxId: 'mb-3',
        tenantId: 't1',
        userId: 'u1',
        mode: null,
        actor: 'user-u1',
        reason: 'none',
      })
    ).toThrowError('managed mailbox security mode is required');
  });

  it('maps residual deletion failures to lifecycle security error type', async () => {
    const scope = { tenantId: 't1', userId: 'u1' };
    const store = new InMemoryLifecycleStore({
      tokens: [{ id: 'token-1', tenantId: 't1', userId: 'u1' }],
    });
    store.setResidualDataset('tokens', true);

    await expect(deleteUserScopedData(scope, store)).rejects.toBeInstanceOf(LifecycleSecurityError);
  });
});
