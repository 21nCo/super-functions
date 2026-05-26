import { describe, expect, it } from 'vitest';
import {
  assertForwardingProviderConfig,
  forwardingProvider,
  getForwardingPolicyAuditLog,
} from '../src/forwarding/index.js';

describe('forwarding provider', () => {
  it('enables optional inbound-only forwarding per account', async () => {
    const result = await forwardingProvider.actions['mail.connect'].execute(
      {
        accountId: 'acct-1',
        enabled: true,
        forwardTo: 'fin+u1@send-governance.mail',
        setupFlow: {
          isOnlyOption: false,
        },
      },
      createActionContext()
    );

    expect(result).toEqual({
      inboundIngestActive: true,
      outboundEnabled: false,
      policyVersion: '2026-03-11',
    });
  });

  it('rejects mandatory forwarding setup mode', async () => {
    await expect(
      forwardingProvider.actions['mail.connect'].execute(
        {
          accountId: 'acct-1',
          enabled: true,
          forwardTo: 'fin+u1@send-governance.mail',
          setupFlow: {
            isOnlyOption: true,
          },
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'forwarding cannot be mandatory',
    });
  });

  it('detects forwarding stalls and missing categories in health checks', async () => {
    const result = await forwardingProvider.actions['mail.health'].execute(
      {
        accountId: 'acct-1',
        lastMessageReceivedAt: '2026-03-11T00:00:00.000Z',
        expectedCategories: ['finance', 'security'],
        seenCategories: ['finance'],
        stallThresholdMinutes: 30,
      },
      createActionContext()
    );

    expect(result).toMatchObject({
      inboundIngestHealthy: false,
      stallDetected: true,
      missingCategories: ['security'],
      policyVersion: '2026-03-11',
    });
  });

  it('emits policy and state transition audit events', async () => {
    const before = getForwardingPolicyAuditLog().length;
    await forwardingProvider.actions['mail.connect'].execute(
      {
        accountId: 'acct-audit',
        enabled: true,
        forwardTo: 'fin+audit@send-governance.mail',
        setupFlow: {
          isOnlyOption: false,
        },
      },
      createActionContext()
    );
    const after = getForwardingPolicyAuditLog();
    const recent = after.slice(before);

    expect(recent.some((event) => event.type === 'policy-decision')).toBe(true);
    expect(
      recent.some(
        (event) =>
          event.type === 'state-transition' && event.transition === 'forwarding.enabled'
      )
    ).toBe(true);
  });

  it('returns deterministic validation error for missing provider config', () => {
    expect(() => assertForwardingProviderConfig(undefined)).toThrowError(
      'forwarding provider config is required'
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
      name: 'forwarding',
      baseUrl: 'mailto://forwarding',
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
