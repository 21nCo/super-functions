import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import {
  ProviderPolicyServiceError,
  createProviderPolicyService,
} from 'plugfn';

const policyService = createProviderPolicyService();

export interface ForwardingProviderConfig {
  accountId: string;
  forwardTo: string;
}

export interface ForwardingHealthResult {
  inboundIngestHealthy: boolean;
  stallDetected: boolean;
  missingCategories: string[];
}

export class ForwardingProviderError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ForwardingProviderError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertForwardingProviderConfig(config: unknown): ForwardingProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new ForwardingProviderError('VALIDATION_ERROR', 'forwarding provider config is required');
  }

  const value = config as Record<string, unknown>;
  const accountId = asNonEmptyString(value.accountId);
  const forwardTo = asNonEmptyString(value.forwardTo);

  if (!accountId || !forwardTo) {
    throw new ForwardingProviderError('VALIDATION_ERROR', 'forwarding provider config is invalid');
  }

  return {
    accountId,
    forwardTo,
  };
}

export function evaluateForwardingHealth(input: {
  lastMessageReceivedAt?: string;
  expectedCategories: string[];
  seenCategories: string[];
  stallThresholdMinutes: number;
  now?: () => string;
}): ForwardingHealthResult {
  const now = Date.parse((input.now ?? (() => new Date().toISOString()))());
  const lastReceived = input.lastMessageReceivedAt
    ? Date.parse(input.lastMessageReceivedAt)
    : Number.NaN;
  const thresholdMs = input.stallThresholdMinutes * 60_000;
  const stallDetected =
    Number.isNaN(lastReceived) || !Number.isFinite(lastReceived)
      ? true
      : now - lastReceived > thresholdMs;

  const seen = new Set(input.seenCategories.map((category) => category.toLowerCase()));
  const missingCategories = input.expectedCategories.filter(
    (category) => !seen.has(category.toLowerCase())
  );

  return {
    inboundIngestHealthy: !stallDetected && missingCategories.length === 0,
    stallDetected,
    missingCategories,
  };
}

export const forwardingProvider: Provider = {
  name: 'forwarding',
  displayName: 'Forwarding',
  version: '1.0.0',
  description: 'Inbound-only forwarding fallback connector',
  baseUrl: 'mailto://forwarding',
  auth: {
    type: AuthType.None,
  },
  actions: {
    'mail.connect': {
      name: 'mail.connect',
      displayName: 'Enable Forwarding',
      description: 'Enable optional inbound-only forwarding ingestion for one account',
      parameters: z.object({
        accountId: z.string().min(1),
        enabled: z.boolean(),
        forwardTo: z.string().min(1),
        setupFlow: z
          .object({
            isOnlyOption: z.boolean().optional(),
          })
          .optional(),
      }),
      returns: z.object({
        inboundIngestActive: z.boolean(),
        outboundEnabled: z.boolean(),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        try {
          const decision = policyService.assertOperationAllowed({
            providerId: 'forwarding',
            operation: 'mail.forwarding.enable',
          });

          if (params.setupFlow?.isOnlyOption) {
            const mandatoryDecision = policyService.checkOperation({
              providerId: 'forwarding',
              operation: 'mail.forwarding.enable.mandatory',
            });
            if (!mandatoryDecision.allowed) {
              throw new ForwardingProviderError(
                'PROVIDER_POLICY_BLOCKED',
                mandatoryDecision.reason ?? 'forwarding cannot be mandatory'
              );
            }
          }

          if (params.enabled) {
            assertForwardingProviderConfig({
              accountId: params.accountId,
              forwardTo: params.forwardTo,
            });
          }

          policyService.recordStateTransition({
            providerId: 'forwarding',
            transition: params.enabled ? 'forwarding.enabled' : 'forwarding.disabled',
            policyVersion: decision.policyVersion,
            details: {
              accountId: params.accountId,
              inboundOnly: true,
            },
          });

          return {
            inboundIngestActive: params.enabled,
            outboundEnabled: false,
            policyVersion: decision.policyVersion,
          };
        } catch (error) {
          if (error instanceof ForwardingProviderError) {
            throw error;
          }
          if (error instanceof ProviderPolicyServiceError) {
            throw new ForwardingProviderError(error.code, error.message);
          }
          throw error;
        }
      },
    },
    'mail.health': {
      name: 'mail.health',
      displayName: 'Forwarding Health',
      description: 'Evaluate forwarding ingestion health for stalls and missing categories',
      parameters: z.object({
        accountId: z.string().min(1),
        lastMessageReceivedAt: z.string().datetime({ offset: true }).optional(),
        expectedCategories: z.array(z.string().min(1)).default(['finance', 'security']),
        seenCategories: z.array(z.string().min(1)).default([]),
        stallThresholdMinutes: z.number().int().positive().default(30),
      }),
      returns: z.object({
        inboundIngestHealthy: z.boolean(),
        stallDetected: z.boolean(),
        missingCategories: z.array(z.string()),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        try {
          const decision = policyService.assertOperationAllowed({
            providerId: 'forwarding',
            operation: 'mail.forwarding.health',
          });

          const health = evaluateForwardingHealth({
            lastMessageReceivedAt: params.lastMessageReceivedAt,
            expectedCategories: params.expectedCategories,
            seenCategories: params.seenCategories,
            stallThresholdMinutes: params.stallThresholdMinutes,
          });

          policyService.recordStateTransition({
            providerId: 'forwarding',
            transition: health.inboundIngestHealthy
              ? 'forwarding.health.ok'
              : 'forwarding.health.degraded',
            policyVersion: decision.policyVersion,
            details: {
              accountId: params.accountId,
              stallDetected: health.stallDetected,
              missingCategories: health.missingCategories.join(','),
            },
          });

          return {
            ...health,
            policyVersion: decision.policyVersion,
          };
        } catch (error) {
          if (error instanceof ProviderPolicyServiceError) {
            throw new ForwardingProviderError(error.code, error.message);
          }
          throw error;
        }
      },
    },
  },
  rateLimit: {
    requests: 120,
    window: 60000,
  },
};

export function getForwardingPolicyAuditLog() {
  return policyService.getAuditLog();
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
