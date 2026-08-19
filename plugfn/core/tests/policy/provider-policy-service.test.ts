import { describe, expect, it } from 'vitest';
import {
  ProviderPolicyServiceError,
  createProviderPolicyService,
} from '../../src/policy/provider-policy-service.js';

describe('provider policy service', () => {
  it('contains inbound-only policy metadata for mail account providers', () => {
    const service = createProviderPolicyService();
    expect(service.listPolicies()).toHaveLength(5);
    expect(service.listPolicies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'gmail',
          metadata: { inbound: true, outbound: false, managed: false },
        }),
        expect.objectContaining({
          providerId: 'imap-smtp',
          metadata: { inbound: true, outbound: false, managed: false },
        }),
      ])
    );
  });

  it('allows operations under the current policy version', () => {
    const service = createProviderPolicyService();
    const decision = service.assertOperationAllowed({
      providerId: 'gmail',
      operation: 'mail.watch.create',
    });

    expect(decision).toEqual({
      providerId: 'gmail',
      operation: 'mail.watch.create',
      allowed: true,
      policyVersion: '2026-03-11',
      timestamp: decision.timestamp,
    });
  });

  it('blocks disallowed operations with canonical policy error', () => {
    const service = createProviderPolicyService();
    expect(() =>
      service.assertOperationAllowed({
        providerId: 'gmail',
        operation: 'mail.read.fullbody',
      })
    ).toThrowError(ProviderPolicyServiceError);
    expect(() =>
      service.assertOperationAllowed({
        providerId: 'gmail',
        operation: 'mail.read.fullbody',
      })
    ).toThrowError('operation not allowed by policy');
  });

  it('audit-logs policy decisions and state transitions', () => {
    const service = createProviderPolicyService([], () => '2026-03-12T00:00:00.000Z');
    service.updatePolicy({
      providerId: 'custom-inbound',
      policyVersion: '2026-03-11',
      metadata: {
        inbound: true,
        outbound: false,
        managed: false,
      },
      allowedOperations: ['mail.sync'],
      actor: 'test',
    });

    service.assertOperationAllowed({
      providerId: 'custom-inbound',
      operation: 'mail.sync',
    });
    service.recordStateTransition({
      providerId: 'custom-inbound',
      transition: 'connection.enabled',
      details: {
        accountId: 'acct-1',
      },
    });

    const audit = service.getAuditLog();
    expect(audit.some((event) => event.type === 'policy-decision')).toBe(true);
    expect(
      audit.some(
        (event) =>
          event.type === 'state-transition' && event.transition === 'connection.enabled'
      )
    ).toBe(true);
  });

  it('audit-logs policy version updates and exposes new version in runtime checks', () => {
    const service = createProviderPolicyService();
    service.updatePolicy({
      providerId: 'gmail',
      policyVersion: '2026-03-12',
      metadata: {
        inbound: true,
        outbound: false,
        managed: false,
      },
      allowedOperations: ['mail.watch.create', 'mail.sync'],
      blockedOperations: {
        'mail.read.fullbody': 'operation not allowed by policy',
      },
      actor: 'admin-user',
    });

    const decision = service.assertOperationAllowed({
      providerId: 'gmail',
      operation: 'mail.watch.create',
    });
    expect(decision.policyVersion).toBe('2026-03-12');

    const events = service.getAuditLog();
    const updateEvent = events.find((event) => event.type === 'policy-version-updated');
    expect(updateEvent).toMatchObject({
      providerId: 'gmail',
      fromVersion: '2026-03-11',
      toVersion: '2026-03-12',
      actor: 'admin-user',
    });
  });
});
