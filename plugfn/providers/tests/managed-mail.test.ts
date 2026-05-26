import { describe, expect, it } from 'vitest';
import {
  assertManagedMailProviderConfig,
  getManagedMailPolicyAuditLog,
  managedMailProvider,
} from '../src/managed-mail/index.js';

describe('managed-mail provider', () => {
  it('enables finance-critical managed mailbox only with explicit safeguards', async () => {
    const result = await managedMailProvider.actions['mail.connect'].execute(
      {
        accountId: 'acct-1',
        financeCritical: true,
        userOptIn: true,
        riskAck: true,
        backupChannelType: 'email',
        backupDestination: 'backup@example.com',
        backupChannelConfirmed: true,
      },
      createActionContext()
    );

    expect(result).toEqual({
      managedMailboxEnabled: true,
      backupChannel: 'confirmed',
      policyVersion: '2026-03-11',
    });
  });

  it('rejects finance-critical setup without backup channel and risk acknowledgment', async () => {
    await expect(
      managedMailProvider.actions['mail.connect'].execute(
        {
          accountId: 'acct-2',
          financeCritical: true,
          userOptIn: true,
          riskAck: false,
          backupChannelType: 'email',
          backupDestination: 'backup@example.com',
          backupChannelConfirmed: false,
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'backup channel and risk acknowledgment required',
    });
  });

  it('rejects managed mailbox enablement without explicit user opt-in', async () => {
    await expect(
      managedMailProvider.actions['mail.connect'].execute(
        {
          accountId: 'acct-3',
          financeCritical: false,
          userOptIn: false,
          riskAck: false,
          backupChannelType: 'email',
          backupDestination: 'backup@example.com',
          backupChannelConfirmed: true,
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'managed mailbox requires explicit user opt-in',
    });
  });

  it('triggers backup alert on critical delivery incident', async () => {
    await managedMailProvider.actions['mail.connect'].execute(
      {
        accountId: 'acct-4',
        financeCritical: true,
        userOptIn: true,
        riskAck: true,
        backupChannelType: 'email',
        backupDestination: 'backup-critical@example.com',
        backupChannelConfirmed: true,
      },
      createActionContext()
    );

    const incident = await managedMailProvider.actions['mail.incident'].execute(
      {
        accountId: 'acct-4',
        severity: 'critical',
        incidentCode: 'DELIVERY_STALL',
        message: 'No finance messages received in threshold window',
      },
      createActionContext()
    );

    expect(incident).toEqual({
      alertTriggered: true,
      backupDestination: 'backup-critical@example.com',
      policyVersion: '2026-03-11',
    });
  });

  it('emits policy and managed state-transition audit events', async () => {
    const before = getManagedMailPolicyAuditLog().length;
    await managedMailProvider.actions['mail.connect'].execute(
      {
        accountId: 'acct-audit',
        financeCritical: true,
        userOptIn: true,
        riskAck: true,
        backupChannelType: 'email',
        backupDestination: 'backup-audit@example.com',
        backupChannelConfirmed: true,
      },
      createActionContext()
    );
    const after = getManagedMailPolicyAuditLog();
    const recent = after.slice(before);

    expect(recent.some((event) => event.type === 'policy-decision')).toBe(true);
    expect(
      recent.some(
        (event) =>
          event.type === 'state-transition' &&
          event.transition === 'managed-mail.finance-guardrails-confirmed'
      )
    ).toBe(true);
  });

  it('returns deterministic validation error for missing provider config', () => {
    expect(() => assertManagedMailProviderConfig(undefined)).toThrowError(
      'managed-mail provider config is required'
    );
  });
});

function createActionContext() {
  const noopHttp = {
    get: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    post: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    put: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    patch: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    delete: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
  };

  return {
    userId: 'user-1',
    connectionId: 'conn-1',
    provider: {
      name: 'managed-mail',
      baseUrl: 'mailbox://managed',
    },
    auth: {
      type: 'none',
      credentials: {},
    },
    http: noopHttp,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}
