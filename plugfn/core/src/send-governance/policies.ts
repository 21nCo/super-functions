import type { SendRequest, SendPolicyDecision } from './types.js';

export interface SendPolicyModel {
  defaultTenantRecipientLimit: number;
  providerRecipientLimits: Record<string, number>;
  blockedDomains: string[];
  abuseScoreThreshold: number;
}

export const defaultSendPolicyModel: SendPolicyModel = {
  defaultTenantRecipientLimit: 1000,
  providerRecipientLimits: {
    gmail: 2000,
    outlook: 1000,
    yahoo: 500,
    icloud: 500,
    'imap-smtp': 500,
  },
  blockedDomains: ['blocked.example'],
  abuseScoreThreshold: 0.9,
};

export function evaluateSendPolicy(
  request: SendRequest,
  policy: SendPolicyModel = defaultSendPolicyModel
): SendPolicyDecision {
  const providerLimit = policy.providerRecipientLimits[request.providerId] ?? 500;
  if (request.recipientCount > providerLimit) {
    return blockedDecision('provider-recipient-limit', `provider recipient cap exceeded: ${providerLimit}`);
  }

  if (request.recipientCount > policy.defaultTenantRecipientLimit) {
    return blockedDecision(
      'tenant-recipient-limit',
      `tenant recipient cap exceeded: ${policy.defaultTenantRecipientLimit}`
    );
  }

  if (request.destinationDomains && request.destinationDomains.length > 0) {
    const blocked = request.destinationDomains.find((domain) =>
      policy.blockedDomains.includes(domain.toLowerCase())
    );
    if (blocked) {
      return blockedDecision('blocked-domain', `destination domain blocked: ${blocked}`);
    }
  }

  if (typeof request.abuseScore === 'number' && request.abuseScore >= policy.abuseScoreThreshold) {
    return blockedDecision(
      'abuse-risk-threshold',
      `abuse score exceeded threshold: ${policy.abuseScoreThreshold}`
    );
  }

  return {
    allowed: true,
    retryable: false,
    matchedPolicy: 'allow-default',
  };
}

function blockedDecision(reason: string, matchedPolicy: string): SendPolicyDecision {
  return {
    allowed: false,
    code: 'MAIL_SEND_BLOCKED',
    message: 'send policy limit exceeded',
    retryable: false,
    reason,
    matchedPolicy,
  };
}
