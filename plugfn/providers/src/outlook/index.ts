import { z } from 'zod';
import { createDefaultProviderPolicyRegistry } from '@superfunctions/oauth-providers';
import {
  AuthType,
  NormalizedMailMessageSchema,
  TriggerType,
  type ActionContext,
  type HttpError,
  type Provider,
} from 'plugfn';
import { secureStringEqual } from '../shared/signature.js';
import {
  MemoryOutlookDeltaTokenStore,
  MemoryOutlookMessageStore,
  OutlookDeltaSyncError,
  runOutlookDeltaSync,
  type OutlookDeltaSource,
} from './outlook.delta.js';
import {
  MemoryOutlookSubscriptionStore,
  ensureOutlookSubscription,
  handleOutlookSubscriptionNotification,
  parseOutlookSubscriptionNotifications,
  type OutlookSubscriptionStore,
  type OutlookSubscriptionClient,
} from './outlook.subscriptions.js';

const defaultDeltaTokenStore = new MemoryOutlookDeltaTokenStore();
const defaultMessageStore = new MemoryOutlookMessageStore();
export const outlookSubscriptionStore = new MemoryOutlookSubscriptionStore();
const defaultPolicyRegistry = createDefaultProviderPolicyRegistry();

const syncParamsSchema = z.object({
  tenantId: z.string().min(1),
  mode: z.enum(['full', 'incremental']).default('incremental'),
  checkpoint: z.string().min(1).optional(),
  maxMessages: z.number().int().min(1).max(500).optional(),
  featureMode: z.enum(['metadata-only', 'snippet', 'full-body']).optional(),
});

const subscriptionParamsSchema = z.object({
  tenantId: z.string().min(1),
  resource: z.string().default("/me/mailFolders('Inbox')/messages"),
  notificationUrl: z.string().url(),
  expirationDateTime: z.string().datetime({ offset: true }).optional(),
  clientState: z.string().min(1),
  renewThresholdMs: z.number().int().min(1).optional(),
  forceRenew: z.boolean().optional(),
  featureMode: z.enum(['metadata-only', 'snippet', 'full-body']).optional(),
});

const subscriptionNotificationParamsSchema = z.object({
  tenantId: z.string().min(1),
  payload: z.unknown(),
});

export class OutlookProviderError extends Error {
  readonly code:
    | 'VALIDATION_ERROR'
    | 'OAUTH_SCOPE_DISALLOWED'
    | 'MAIL_SYNC_CHECKPOINT_INVALID'
    | 'PROVIDER_POLICY_BLOCKED';
  readonly status: number;

  constructor(
    code:
      | 'VALIDATION_ERROR'
      | 'OAUTH_SCOPE_DISALLOWED'
      | 'MAIL_SYNC_CHECKPOINT_INVALID'
      | 'PROVIDER_POLICY_BLOCKED',
    message: string
  ) {
    super(message);
    this.name = 'OutlookProviderError';
    this.code = code;
    this.status = code === 'MAIL_SYNC_CHECKPOINT_INVALID' ? 409 : 400;
  }
}

export interface OutlookProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export function assertOutlookProviderConfig(config: unknown): OutlookProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new OutlookProviderError('VALIDATION_ERROR', 'outlook provider config is required');
  }

  const asRecord = config as Record<string, unknown>;
  const clientId = typeof asRecord.clientId === 'string' ? asRecord.clientId.trim() : '';
  const clientSecret = typeof asRecord.clientSecret === 'string' ? asRecord.clientSecret.trim() : '';
  const redirectUris = Array.isArray(asRecord.redirectUris)
    ? asRecord.redirectUris.filter((value): value is string => {
        return typeof value === 'string' && value.trim().length > 0;
      })
    : [];

  if (!clientId || !clientSecret || redirectUris.length === 0) {
    throw new OutlookProviderError('VALIDATION_ERROR', 'outlook provider config is invalid');
  }

  return {
    clientId,
    clientSecret,
    redirectUris,
  };
}

export function resolveOutlookScopes(
  features: string[] = ['mail.read.metadata', 'profile.basic']
): string[] {
  const policy = defaultPolicyRegistry.getPolicy('microsoft');
  const scopes = new Set<string>();

  for (const feature of features) {
    const featurePolicy = policy.featureScopes[feature];
    if (!featurePolicy) {
      throw new OutlookProviderError(
        'OAUTH_SCOPE_DISALLOWED',
        `feature scope policy not found: ${feature}`
      );
    }

    for (const scope of featurePolicy.allowedScopes) {
      scopes.add(scope);
    }
  }

  return [...scopes];
}

export const outlookProvider: Provider = {
  name: 'outlook',
  displayName: 'Outlook',
  version: '1.0.0',
  description: 'Microsoft Graph mail delta and subscription adapter for Outlook',
  iconUrl: 'https://res.cdn.office.net/assets/mail/pwa/v3/pngs/logo_mail_5x.png',
  baseUrl: 'https://graph.microsoft.com',
  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: resolveOutlookScopes(),
      scopeSeparator: ' ',
    },
  },
  actions: {
    'mail.sync': {
      name: 'mail.sync',
      displayName: 'Sync Mail',
      description: 'Sync Outlook messages using Graph delta checkpoints',
      idempotent: true,
      parameters: syncParamsSchema,
      returns: z.object({
        checkpoint: z.string(),
        fetched: z.number().int().nonnegative(),
        upserted: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
        partial: z.boolean(),
        messages: z.array(NormalizedMailMessageSchema),
      }),
      execute: async (
        params: z.infer<typeof syncParamsSchema>,
        context: ActionContext
      ) => {
        const connectionId = requireConnectionId(context);
        const source = createOutlookDeltaSource(context);
        const result = await runOutlookDeltaSync(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            mode: params.mode,
            checkpoint: params.checkpoint,
            maxMessages: params.maxMessages,
            featureMode: params.featureMode,
          },
          {
            source,
            checkpointStore: defaultDeltaTokenStore,
            messageStore: defaultMessageStore,
            policyRegistry: defaultPolicyRegistry,
          }
        );

        return {
          checkpoint: result.checkpoint,
          fetched: result.fetched,
          upserted: result.upserted,
          skipped: result.skipped,
          partial: result.partial,
          messages: result.messages,
        };
      },
    },
    'mail.subscription.ensure': {
      name: 'mail.subscription.ensure',
      displayName: 'Ensure Subscription',
      description: 'Create or renew Graph change notification subscription',
      parameters: subscriptionParamsSchema,
      returns: z.object({
        renewed: z.boolean(),
        subscriptionId: z.string(),
        expirationDateTime: z.string().datetime({ offset: true }),
        policyVersion: z.string(),
      }),
      execute: async (
        params: z.infer<typeof subscriptionParamsSchema>,
        context: ActionContext
      ) => {
        const connectionId = requireConnectionId(context);
        const subscriptionClient = createOutlookSubscriptionClient(context);
        const ensured = await ensureOutlookSubscription(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            resource: params.resource,
            notificationUrl: params.notificationUrl,
            expirationDateTime: params.expirationDateTime,
            clientState: params.clientState,
            renewThresholdMs: params.renewThresholdMs,
            forceRenew: params.forceRenew,
            featureMode: params.featureMode,
          },
          {
            subscriptionStore: outlookSubscriptionStore,
            subscriptionClient,
            policyRegistry: defaultPolicyRegistry,
          }
        );

        return {
          renewed: ensured.renewed,
          subscriptionId: ensured.subscription.subscriptionId,
          expirationDateTime: ensured.subscription.expirationDateTime,
          policyVersion: ensured.subscription.policyVersion,
        };
      },
    },
    'mail.subscription.handlePush': {
      name: 'mail.subscription.handlePush',
      displayName: 'Handle Subscription Push',
      description: 'Handle Graph push notifications and trigger incremental sync',
      parameters: subscriptionNotificationParamsSchema,
      returns: z.object({
        triggered: z.boolean(),
        count: z.number().int().nonnegative(),
      }),
      execute: async (
        params: z.infer<typeof subscriptionNotificationParamsSchema>,
        context: ActionContext
      ) => {
        const connectionId = requireConnectionId(context);
        const source = createOutlookDeltaSource(context);
        const result = await handleOutlookSubscriptionNotification(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            payload: params.payload,
          },
          {
            subscriptionStore: outlookSubscriptionStore,
            triggerDeltaSync: async ({ tenantId, userId, connectionId: syncConnectionId }) => {
              await runOutlookDeltaSync(
                {
                  tenantId,
                  userId,
                  connectionId: syncConnectionId,
                  mode: 'incremental',
                },
                {
                  source,
                  checkpointStore: defaultDeltaTokenStore,
                  messageStore: defaultMessageStore,
                  policyRegistry: defaultPolicyRegistry,
                }
              );
            },
          }
        );

        return result;
      },
    },
  },
  triggers: {
    'mail.update': {
      name: 'mail.update',
      displayName: 'Mail Update',
      description: 'Triggered from Graph subscription notifications',
      type: TriggerType.Webhook,
      webhookConfig: {
        path: '/webhooks/outlook/mail-update',
        method: 'POST',
        verifySignature: (payload) =>
          verifyOutlookSubscriptionClientState(payload, outlookSubscriptionStore),
      },
      schema: z.object({
        value: z.array(z.unknown()),
      }),
      handler: async (payload: unknown) => {
        const notifications = parseOutlookSubscriptionNotifications(payload);
        return {
          event: 'mail.update',
          data: notifications,
        };
      },
    },
  },
  rateLimit: {
    requests: 1000,
    window: 60000,
  },
};

export function verifyOutlookClientState(
  payload: unknown,
  expectedClientState: string
): boolean {
  if (!payload || typeof payload !== 'object' || !expectedClientState) {
    return false;
  }

  const entries = (payload as Record<string, unknown>).value;
  if (!Array.isArray(entries) || entries.length === 0) {
    return false;
  }

  return entries.every((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const clientState = (entry as Record<string, unknown>).clientState;
    return (
      typeof clientState === 'string' && secureStringEqual(clientState, expectedClientState)
    );
  });
}

export async function verifyOutlookSubscriptionClientState(
  payload: unknown,
  subscriptionStore: OutlookSubscriptionStore
): Promise<boolean> {
  let notifications;
  try {
    notifications = parseOutlookSubscriptionNotifications(payload);
  } catch {
    return false;
  }

  for (const notification of notifications) {
    const subscription = await subscriptionStore.getBySubscriptionId(notification.subscriptionId);
    if (
      !subscription?.clientState ||
      !notification.clientState ||
      !secureStringEqual(notification.clientState, subscription.clientState)
    ) return false;
  }
  return true;
}

function requireConnectionId(context: ActionContext): string {
  if (context.connectionId && context.connectionId.length > 0) {
    return context.connectionId;
  }

  throw new OutlookProviderError(
    'VALIDATION_ERROR',
    'outlook action requires explicit connectionId when multiple connections may exist'
  );
}

function createOutlookDeltaSource(context: ActionContext): OutlookDeltaSource {
  return {
    listDelta: async ({ deltaToken, maxMessages }) => {
      const url = resolveOutlookDeltaRequestUrl(context.provider.baseUrl, deltaToken);

      try {
        const response = await context.http.get<{
          value?: Array<Record<string, unknown>>;
          '@odata.nextLink'?: string;
          '@odata.deltaLink'?: string;
        }>(url, {
          params: deltaToken
            ? undefined
            : {
                '$top': maxMessages,
              },
        });

        const nextDeltaToken = response.data['@odata.deltaLink'] ?? response.data['@odata.nextLink'];
        if (!nextDeltaToken || nextDeltaToken.length === 0) {
          throw new OutlookProviderError('VALIDATION_ERROR', 'graph delta response missing checkpoint token');
        }

        return {
          messages: (response.data.value ?? []) as any,
          nextDeltaToken,
          partial: Boolean(response.data['@odata.nextLink']),
        };
      } catch (error) {
        const httpError = error as HttpError & {
          status?: number;
          data?: Record<string, unknown>;
        };
        if (httpError.status === 429) {
          throw {
            status: 429,
            retryAfterSeconds: extractRetryAfterSeconds(httpError.data),
            message: 'graph throttled',
          };
        }

        if (httpError.status === 404 || httpError.status === 410) {
          throw new OutlookDeltaSyncError('MAIL_SYNC_CHECKPOINT_INVALID', 'outlook delta token invalid');
        }

        throw error;
      }
    },
  };
}

export function resolveOutlookDeltaRequestUrl(
  baseUrl: string,
  deltaToken?: string
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const defaultUrl = `${normalizedBaseUrl}/v1.0/me/messages/delta`;
  if (!deltaToken) {
    return defaultUrl;
  }

  let requestUrl: URL;
  let providerUrl: URL;
  try {
    providerUrl = new URL(normalizedBaseUrl);
    requestUrl = new URL(deltaToken, `${normalizedBaseUrl}/`);
  } catch {
    throw new OutlookProviderError(
      'VALIDATION_ERROR',
      'outlook delta checkpoint URL is invalid'
    );
  }

  if (requestUrl.origin !== providerUrl.origin) {
    throw new OutlookProviderError(
      'VALIDATION_ERROR',
      'outlook delta checkpoint URL must use the Microsoft Graph origin'
    );
  }

  return requestUrl.toString();
}

function createOutlookSubscriptionClient(context: ActionContext): OutlookSubscriptionClient {
  return {
    createOrRenew: async ({
      subscriptionId,
      resource,
      notificationUrl,
      expirationDateTime,
      clientState,
    }) => {
      const payload = {
        changeType: 'created,updated',
        resource,
        notificationUrl,
        expirationDateTime,
        clientState,
      };

      try {
        const response = subscriptionId
          ? await context.http.patch<{
              id: string;
              expirationDateTime: string;
            }>(`${context.provider.baseUrl}/v1.0/subscriptions/${subscriptionId}`, payload)
          : await context.http.post<{
              id: string;
              expirationDateTime: string;
            }>(`${context.provider.baseUrl}/v1.0/subscriptions`, payload);

        return {
          subscriptionId: response.data.id,
          expirationDateTime: response.data.expirationDateTime,
        };
      } catch (error) {
        const httpError = error as HttpError & {
          status?: number;
          data?: Record<string, unknown>;
        };
        if (httpError.status === 429) {
          throw {
            status: 429,
            retryAfterSeconds: extractRetryAfterSeconds(httpError.data),
            message: 'graph throttled',
          };
        }

        throw error;
      }
    },
  };
}

function extractRetryAfterSeconds(data: Record<string, unknown> | undefined): number | undefined {
  if (!data) {
    return undefined;
  }

  const topLevelRetryAfter = data.retryAfter;
  if (typeof topLevelRetryAfter === 'number' && Number.isFinite(topLevelRetryAfter)) {
    return topLevelRetryAfter;
  }

  if (typeof topLevelRetryAfter === 'string') {
    const parsed = Number(topLevelRetryAfter);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const nestedError = data.error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedRetryAfter = (nestedError as Record<string, unknown>).retryAfter;
    if (typeof nestedRetryAfter === 'number' && Number.isFinite(nestedRetryAfter)) {
      return nestedRetryAfter;
    }
    if (typeof nestedRetryAfter === 'string') {
      const parsed = Number(nestedRetryAfter);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}
