import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  createDefaultProviderPolicyRegistry,
} from '@superfunctions/oauth-providers';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { ActionContext } from 'plugfn';
import type { HttpError } from 'plugfn';
import { NormalizedMailMessageSchema, type GmailApiMessage } from 'plugfn';
import {
  MemoryGmailCheckpointStore,
  MemoryGmailMessageStore,
  runGmailSync,
  type GmailSyncRequest,
  type GmailSyncSource,
} from './gmail.sync.js';
import {
  MemoryGmailWatchStore,
  ensureGmailWatch,
  handleGmailPushNotification,
  parseGmailPushPayload,
  type GmailWatchClient,
} from './gmail.watch.js';
import type { WebhookVerificationContext } from 'plugfn';

const defaultCheckpointStore = new MemoryGmailCheckpointStore();
const defaultMessageStore = new MemoryGmailMessageStore();
const defaultWatchStore = new MemoryGmailWatchStore();
const defaultPolicyRegistry = createDefaultProviderPolicyRegistry();
const googleOidcKeySet = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);
const googleOidcIssuers = ['accounts.google.com', 'https://accounts.google.com'];

const syncParamsSchema = z.object({
  tenantId: z.string().min(1),
  mode: z.enum(['full', 'incremental']).default('incremental'),
  checkpoint: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  featureMode: z.enum(['metadata-only', 'snippet', 'full-body']).optional(),
});

const ensureWatchParamsSchema = z.object({
  tenantId: z.string().min(1),
  topicName: z.string().min(1),
  labelIds: z.array(z.string().min(1)).optional(),
  labelFilterAction: z.enum(['include', 'exclude']).optional(),
  renewThresholdMs: z.number().int().min(1).optional(),
  forceRenew: z.boolean().optional(),
  featureMode: z.enum(['metadata-only', 'snippet', 'full-body']).optional(),
});

const pushParamsSchema = z.object({
  tenantId: z.string().min(1),
  payload: z.unknown(),
});

export class GmailProviderError extends Error {
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
    this.name = 'GmailProviderError';
    this.code = code;
    this.status = code === 'MAIL_SYNC_CHECKPOINT_INVALID' ? 409 : 400;
  }
}

export interface GmailProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export function assertGmailProviderConfig(config: unknown): GmailProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new GmailProviderError('VALIDATION_ERROR', 'gmail provider config is required');
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
    throw new GmailProviderError('VALIDATION_ERROR', 'gmail provider config is invalid');
  }

  return {
    clientId,
    clientSecret,
    redirectUris,
  };
}

export function resolveGmailScopes(
  features: string[] = ['mail.read.metadata', 'profile.basic']
): string[] {
  const policy = defaultPolicyRegistry.getPolicy('google');
  const scopes = new Set<string>();

  for (const feature of features) {
    const featurePolicy = policy.featureScopes[feature];
    if (!featurePolicy) {
      throw new GmailProviderError(
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

export const gmailProvider: Provider = {
  name: 'gmail',
  displayName: 'Gmail',
  version: '1.0.0',
  description: 'Gmail mail sync adapter with checkpointed incremental sync and watch lifecycle support',
  iconUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  baseUrl: 'https://gmail.googleapis.com',
  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: resolveGmailScopes(),
      scopeSeparator: ' ',
    },
  },
  actions: {
    'mail.sync': {
      name: 'mail.sync',
      displayName: 'Sync Mail',
      description: 'Sync Gmail messages using full baseline or incremental checkpoints',
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
        const source = createGmailSyncSource(context);

        const result = await runGmailSync(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            mode: params.mode,
            checkpoint: params.checkpoint,
            pageSize: params.pageSize,
            featureMode: params.featureMode,
          },
          {
            source,
            checkpointStore: defaultCheckpointStore,
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
    'mail.watch.ensure': {
      name: 'mail.watch.ensure',
      displayName: 'Ensure Watch',
      description: 'Create or renew Gmail push watch subscription',
      parameters: ensureWatchParamsSchema,
      returns: z.object({
        renewed: z.boolean(),
        historyId: z.string(),
        expiration: z.string().datetime({ offset: true }),
        policyVersion: z.string(),
      }),
      execute: async (
        params: z.infer<typeof ensureWatchParamsSchema>,
        context: ActionContext
      ) => {
        const connectionId = requireConnectionId(context);
        const watchClient = createGmailWatchClient(context);
        const result = await ensureGmailWatch(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            topicName: params.topicName,
            labelIds: params.labelIds,
            labelFilterAction: params.labelFilterAction,
            renewThresholdMs: params.renewThresholdMs,
            forceRenew: params.forceRenew,
            featureMode: params.featureMode,
          },
          {
            watchStore: defaultWatchStore,
            watchClient,
            policyRegistry: defaultPolicyRegistry,
          }
        );

        return {
          renewed: result.renewed,
          historyId: result.watch.historyId,
          expiration: result.watch.expiration,
          policyVersion: result.watch.policyVersion,
        };
      },
    },
    'mail.watch.handlePush': {
      name: 'mail.watch.handlePush',
      displayName: 'Handle Watch Push',
      description: 'Handle Gmail push payload and trigger incremental sync',
      parameters: pushParamsSchema,
      returns: z.object({
        triggered: z.boolean(),
        historyId: z.string(),
      }),
      execute: async (
        params: z.infer<typeof pushParamsSchema>,
        context: ActionContext
      ) => {
        const connectionId = requireConnectionId(context);
        const source = createGmailSyncSource(context);
        const result = await handleGmailPushNotification(
          {
            tenantId: params.tenantId,
            userId: context.userId,
            connectionId,
            payload: params.payload,
          },
          {
            watchStore: defaultWatchStore,
            triggerIncrementalSync: async ({ tenantId, userId, connectionId: syncConnectionId }) => {
              const request: GmailSyncRequest = {
                tenantId,
                userId,
                connectionId: syncConnectionId,
                mode: 'incremental',
              };
              await runGmailSync(request, {
                source,
                checkpointStore: defaultCheckpointStore,
                messageStore: defaultMessageStore,
                policyRegistry: defaultPolicyRegistry,
              });
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
      description: 'Triggered when Gmail watch push payload indicates new history',
      type: TriggerType.Webhook,
      webhookConfig: {
        path: '/webhooks/gmail/mail-update',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGmailSignature(payload, signature, secret, context);
        },
      },
      schema: z.object({
        message: z
          .object({
            data: z.string().min(1),
          })
          .optional(),
        historyId: z.string().optional(),
        emailAddress: z.string().optional(),
      }),
      handler: async (payload: unknown) => {
        const parsed = parseGmailPushPayload(payload);
        return {
          event: 'mail.update',
          data: parsed,
        };
      },
    },
  },
  rateLimit: {
    requests: 1000,
    window: 60000,
  },
};

function requireConnectionId(context: ActionContext): string {
  if (context.connectionId && context.connectionId.length > 0) {
    return context.connectionId;
  }
  throw new GmailProviderError(
    'VALIDATION_ERROR',
    'gmail action requires explicit connectionId when multiple connections may exist'
  );
}

function createGmailSyncSource(context: ActionContext): GmailSyncSource {
  return {
    listBaseline: async ({ pageSize, pageToken }) => {
      const response = await context.http.get<{
        messages?: Array<{ id?: string } | GmailApiMessage>;
        nextPageToken?: string;
        historyId?: string;
      }>(`${context.provider.baseUrl}/gmail/v1/users/me/messages`, {
        params: {
          maxResults: pageSize,
          ...(pageToken ? { pageToken } : {}),
        },
      });

      const summaries = response.data.messages ?? [];
      const messages = await hydrateMessages(context, summaries);

      return {
        messages,
        nextPageToken: response.data.nextPageToken,
        historyId: response.data.historyId,
      };
    },
    listIncremental: async ({ startHistoryId, pageSize }) => {
      try {
        const summaries: Array<{ id?: string } | GmailApiMessage> = [];
        const seenPageTokens = new Set<string>();
        let pageToken: string | undefined;
        let historyId = startHistoryId;

        do {
          const response = await context.http.get<{
            history?: Array<{
              messages?: Array<{ id?: string } | GmailApiMessage>;
              messagesAdded?: Array<{ message?: { id?: string } | GmailApiMessage }>;
            }>;
            historyId?: string;
            nextPageToken?: string;
          }>(`${context.provider.baseUrl}/gmail/v1/users/me/history`, {
            params: {
              startHistoryId,
              maxResults: pageSize,
              historyTypes: 'messageAdded',
              ...(pageToken ? { pageToken } : {}),
            },
          });

          for (const item of response.data.history ?? []) {
            for (const message of item.messages ?? []) {
              summaries.push(message);
            }
            for (const added of item.messagesAdded ?? []) {
              if (added.message) {
                summaries.push(added.message);
              }
            }
          }

          historyId = response.data.historyId ?? historyId;
          const nextPageToken = response.data.nextPageToken;
          if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
            pageToken = undefined;
          } else {
            seenPageTokens.add(nextPageToken);
            pageToken = nextPageToken;
          }
        } while (pageToken);

        const messages = await hydrateMessages(context, summaries);
        return {
          messages,
          historyId,
        };
      } catch (error) {
        const httpError = error as HttpError & { data?: Record<string, unknown> };
        if (httpError.status === 404) {
          throw new GmailProviderError(
            'MAIL_SYNC_CHECKPOINT_INVALID',
            'gmail checkpoint invalid; rebaseline required'
          );
        }
        throw error;
      }
    },
  };
}

function createGmailWatchClient(context: ActionContext): GmailWatchClient {
  return {
    createWatch: async ({ topicName, labelIds, labelFilterAction }) => {
      const response = await context.http.post<{
        historyId: string;
        expiration: string | number;
      }>(`${context.provider.baseUrl}/gmail/v1/users/me/watch`, {
        topicName,
        labelIds,
        labelFilterAction,
      });

      return {
        historyId: response.data.historyId,
        expiration: response.data.expiration,
      };
    },
  };
}

async function hydrateMessages(
  context: ActionContext,
  entries: Array<{ id?: string } | GmailApiMessage>
): Promise<GmailApiMessage[]> {
  const messages: GmailApiMessage[] = [];

  for (const entry of entries) {
    if (isHydratedGmailApiMessage(entry)) {
      messages.push(entry);
      continue;
    }

    if (!entry.id) {
      continue;
    }

    const response = await context.http.get<GmailApiMessage>(
      `${context.provider.baseUrl}/gmail/v1/users/me/messages/${entry.id}`,
      {
        params: {
          format: 'full',
        },
      }
    );
    messages.push(response.data);
  }

  return messages;
}

export function isHydratedGmailApiMessage(value: unknown): value is GmailApiMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string') {
    return false;
  }

  // List summaries only include id/threadId; require hydrated fields before skipping fetch.
  return (
    (typeof candidate.payload === 'object' && candidate.payload !== null) ||
    typeof candidate.snippet === 'string' ||
    typeof candidate.internalDate === 'string'
  );
}

function verifyGmailSignature(
  _payload: unknown,
  _signature: string,
  verificationConfig: string,
  context: WebhookVerificationContext
): Promise<boolean> {
  return verifyGmailPubSubAuthorization(
    context.headers.authorization,
    verificationConfig
  );
}

/**
 * Verify an authenticated Cloud Pub/Sub push. The verification config is the
 * JSON-encoded `{ audience, serviceAccountEmail }` value supplied through the
 * router's per-provider webhook credential resolver.
 */
export async function verifyGmailPubSubAuthorization(
  authorizationHeader: string | undefined,
  verificationConfig: string,
  keySet: Parameters<typeof jwtVerify>[1] = googleOidcKeySet
): Promise<boolean> {
  const token = readBearerToken(authorizationHeader);
  const config = parseGmailPubSubVerificationConfig(verificationConfig);
  if (!token || !config) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      audience: config.audience,
      issuer: googleOidcIssuers,
    });
    return (
      payload.email === config.serviceAccountEmail &&
      payload.email_verified === true
    );
  } catch {
    return false;
  }
}

function readBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const separator = authorizationHeader.indexOf(' ');
  if (separator < 0 || authorizationHeader.slice(0, separator).toLowerCase() !== 'bearer') {
    return undefined;
  }

  const token = authorizationHeader.slice(separator + 1).trim();
  return token.length > 0 ? token : undefined;
}

function parseGmailPubSubVerificationConfig(value: string): {
  audience: string;
  serviceAccountEmail: string;
} | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const audience = typeof parsed.audience === 'string' ? parsed.audience.trim() : '';
    const serviceAccountEmail =
      typeof parsed.serviceAccountEmail === 'string'
        ? parsed.serviceAccountEmail.trim()
        : '';
    if (!audience || !serviceAccountEmail) {
      return undefined;
    }
    return { audience, serviceAccountEmail };
  } catch {
    return undefined;
  }
}
