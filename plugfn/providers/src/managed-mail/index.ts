import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import {
  ProviderPolicyServiceError,
  createProviderPolicyService,
} from 'plugfn';
import {
  ManagedMailboxPolicyError,
  enforceManagedMailboxSetup,
  handleManagedMailboxIncident,
  type ManagedMailboxState,
} from 'plugfn';
import type { BackupChannelType } from 'plugfn';

const policyService = createProviderPolicyService();
const managedMailboxStateStore = new Map<string, ManagedMailboxState>();

export interface ManagedMailProviderConfig {
  accountId: string;
}

export class ManagedMailProviderError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ManagedMailProviderError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertManagedMailProviderConfig(config: unknown): ManagedMailProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new ManagedMailProviderError('VALIDATION_ERROR', 'managed-mail provider config is required');
  }

  const value = config as Record<string, unknown>;
  const accountId = typeof value.accountId === 'string' ? value.accountId.trim() : '';
  if (!accountId) {
    throw new ManagedMailProviderError('VALIDATION_ERROR', 'managed-mail provider config is invalid');
  }

  return {
    accountId,
  };
}

export const managedMailProvider: Provider = {
  name: 'managed-mail',
  displayName: 'Managed Mailbox',
  version: '1.0.0',
  description: 'Managed mailbox mode with explicit opt-in and finance safety controls',
  baseUrl: 'mailbox://managed',
  auth: {
    type: AuthType.None,
  },
  actions: {
    'mail.connect': {
      name: 'mail.connect',
      displayName: 'Enable Managed Mailbox',
      description: 'Enable managed mailbox mode with explicit consent and backup safeguards',
      parameters: z.object({
        accountId: z.string().min(1),
        financeCritical: z.boolean().default(true),
        userOptIn: z.boolean(),
        riskAck: z.boolean(),
        backupChannelType: z.enum(['email', 'phone', 'webhook']).default('email'),
        backupDestination: z.string().min(1),
        backupChannelConfirmed: z.boolean(),
      }),
      returns: z.object({
        managedMailboxEnabled: z.boolean(),
        backupChannel: z.literal('confirmed'),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        try {
          const policyDecision = policyService.assertOperationAllowed({
            providerId: 'managed-mail',
            operation: 'mail.managed.enable',
          });

          if (params.financeCritical && (!params.backupChannelConfirmed || !params.riskAck)) {
            const unsafeDecision = policyService.checkOperation({
              providerId: 'managed-mail',
              operation: 'mail.managed.enable.finance-unsafe',
            });
            if (!unsafeDecision.allowed) {
              throw new ManagedMailProviderError(
                'PROVIDER_POLICY_BLOCKED',
                unsafeDecision.reason ?? 'backup channel and risk acknowledgment required'
              );
            }
          }

          const setup = enforceManagedMailboxSetup({
            financeCritical: params.financeCritical,
            userOptIn: params.userOptIn,
            riskAck: params.riskAck,
            backupChannel: {
              type: params.backupChannelType as BackupChannelType,
              destination: params.backupDestination,
              confirmed: params.backupChannelConfirmed,
            },
          });
          managedMailboxStateStore.set(params.accountId, setup.state);

          for (const transition of setup.transitions) {
            policyService.recordStateTransition({
              providerId: 'managed-mail',
              transition,
              policyVersion: policyDecision.policyVersion,
              details: {
                accountId: params.accountId,
                financeCritical: params.financeCritical,
              },
            });
          }

          return {
            managedMailboxEnabled: setup.state.managedMailboxEnabled,
            backupChannel: setup.backupChannel,
            policyVersion: policyDecision.policyVersion,
          };
        } catch (error) {
          if (error instanceof ManagedMailProviderError) {
            throw error;
          }
          if (error instanceof ManagedMailboxPolicyError) {
            throw new ManagedMailProviderError(error.code, error.message);
          }
          if (error instanceof ProviderPolicyServiceError) {
            throw new ManagedMailProviderError(error.code, error.message);
          }
          throw error;
        }
      },
    },
    'mail.incident': {
      name: 'mail.incident',
      displayName: 'Handle Critical Incident',
      description: 'Handle delivery incidents and trigger backup-channel alerts',
      parameters: z.object({
        accountId: z.string().min(1),
        severity: z.enum(['critical', 'warning']).default('critical'),
        incidentCode: z.string().min(1),
        message: z.string().min(1),
      }),
      returns: z.object({
        alertTriggered: z.boolean(),
        backupDestination: z.string().optional(),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        try {
          const policyDecision = policyService.assertOperationAllowed({
            providerId: 'managed-mail',
            operation: 'mail.managed.incident',
          });
          const state = managedMailboxStateStore.get(params.accountId);
          if (!state) {
            throw new ManagedMailProviderError(
              'VALIDATION_ERROR',
              'managed mailbox must be enabled before handling incidents'
            );
          }

          const result = handleManagedMailboxIncident({
            state,
            severity: params.severity,
            incidentCode: params.incidentCode,
            message: params.message,
          });

          for (const transition of result.transitions) {
            policyService.recordStateTransition({
              providerId: 'managed-mail',
              transition,
              policyVersion: policyDecision.policyVersion,
              details: {
                accountId: params.accountId,
                severity: params.severity,
              },
            });
          }

          return {
            alertTriggered: result.alertTriggered,
            backupDestination: result.alert?.destination,
            policyVersion: policyDecision.policyVersion,
          };
        } catch (error) {
          if (error instanceof ManagedMailProviderError) {
            throw error;
          }
          if (error instanceof ManagedMailboxPolicyError) {
            throw new ManagedMailProviderError(error.code, error.message);
          }
          if (error instanceof ProviderPolicyServiceError) {
            throw new ManagedMailProviderError(error.code, error.message);
          }
          throw error;
        }
      },
    },
  },
  rateLimit: {
    requests: 100,
    window: 60000,
  },
};

export function getManagedMailPolicyAuditLog() {
  return policyService.getAuditLog();
}
