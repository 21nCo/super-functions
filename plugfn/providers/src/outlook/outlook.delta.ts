import {
  createDefaultProviderPolicyRegistry,
  ProviderPolicyError,
  type ProviderFeatureMode,
  type ProviderPolicyRegistry,
} from '@superfunctions/oauth-providers';
import { RetryMiddleware } from 'plugfn';
import { RateLimiter } from 'plugfn';
import {
  normalizeOutlookMessages,
  type NormalizedMailMessage,
  type OutlookGraphMessage,
} from 'plugfn';

export type OutlookSyncMode = 'full' | 'incremental';

export interface OutlookDeltaSyncRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  mode: OutlookSyncMode;
  checkpoint?: string;
  maxMessages?: number;
  featureMode?: ProviderFeatureMode;
}

export interface OutlookDeltaCheckpoint {
  deltaToken: string;
  updatedAt: string;
}

export interface OutlookDeltaSyncResult {
  checkpoint: string;
  fetched: number;
  upserted: number;
  skipped: number;
  partial: boolean;
  messages: NormalizedMailMessage[];
}

export interface OutlookDeltaTokenStore {
  get(connectionId: string): Promise<OutlookDeltaCheckpoint | null>;
  set(connectionId: string, checkpoint: OutlookDeltaCheckpoint): Promise<void>;
}

export interface OutlookMessageStore {
  upsert(
    connectionId: string,
    messages: NormalizedMailMessage[]
  ): Promise<{ upserted: number; skipped: number }>;
}

export interface OutlookDeltaSource {
  listDelta(input: {
    deltaToken?: string;
    maxMessages: number;
  }): Promise<{
    messages: OutlookGraphMessage[];
    nextDeltaToken: string;
    partial?: boolean;
  }>;
}

export interface RunOutlookDeltaSyncDependencies {
  source: OutlookDeltaSource;
  checkpointStore: OutlookDeltaTokenStore;
  messageStore?: OutlookMessageStore;
  policyRegistry?: ProviderPolicyRegistry;
  retryMiddleware?: RetryMiddleware;
  rateLimiter?: RateLimiter;
  rateLimitConfig?: {
    requests: number;
    window: number;
  };
  now?: () => string;
}

export class OutlookDeltaSyncError extends Error {
  readonly code: 'MAIL_SYNC_CHECKPOINT_INVALID' | 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: 'MAIL_SYNC_CHECKPOINT_INVALID' | 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'OutlookDeltaSyncError';
    this.code = code;
    this.status = code === 'MAIL_SYNC_CHECKPOINT_INVALID' ? 409 : 400;
    this.retryable = code !== 'PROVIDER_POLICY_BLOCKED';
  }
}

export async function runOutlookDeltaSync(
  request: OutlookDeltaSyncRequest,
  dependencies: RunOutlookDeltaSyncDependencies
): Promise<OutlookDeltaSyncResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const policyRegistry = dependencies.policyRegistry ?? createDefaultProviderPolicyRegistry();
  assertReadPolicy(policyRegistry, request.featureMode);
  const maxMessages = clampMaxMessages(request.maxMessages);
  const messageStore = dependencies.messageStore ?? new MemoryOutlookMessageStore();
  const retryMiddleware =
    dependencies.retryMiddleware ?? new RetryMiddleware({ maxAttempts: 5, delay: 500 });
  const ownedRateLimiter =
    dependencies.rateLimiter === undefined
      ? new RateLimiter()
      : null;
  const rateLimiter = dependencies.rateLimiter ?? ownedRateLimiter!;
  const rateLimitConfig = dependencies.rateLimitConfig ?? {
    requests: 20,
    window: 60000,
  };

  const existingCheckpoint = request.checkpoint
    ? { deltaToken: request.checkpoint, updatedAt: now() }
    : await dependencies.checkpointStore.get(request.connectionId);
  const currentDeltaToken = existingCheckpoint?.deltaToken;

  if (request.mode === 'incremental' && !currentDeltaToken) {
    ownedRateLimiter?.destroy();
    throw new OutlookDeltaSyncError('MAIL_SYNC_CHECKPOINT_INVALID', 'outlook delta token invalid');
  }

  try {
    const listResult = await retryMiddleware.execute(async () => {
      await rateLimiter.acquireMany(
        [
          'provider:outlook',
          `provider:outlook:tenant:${request.tenantId}`,
        ],
        rateLimitConfig
      );
      return dependencies.source.listDelta({
        deltaToken: request.mode === 'incremental' ? currentDeltaToken : undefined,
        maxMessages,
      });
    }, 'outlook.delta');

    const normalizedMessages = normalizeOutlookMessages(listResult.data.messages, {
      mailbox: 'inbox',
    });
    const writeResult = await messageStore.upsert(request.connectionId, normalizedMessages);

    await dependencies.checkpointStore.set(request.connectionId, {
      deltaToken: listResult.data.nextDeltaToken,
      updatedAt: now(),
    });

    return {
      checkpoint: listResult.data.nextDeltaToken,
      fetched: normalizedMessages.length,
      upserted: writeResult.upserted,
      skipped: writeResult.skipped,
      partial: listResult.data.partial === true,
      messages: normalizedMessages,
    };
  } catch (error) {
    if (isInvalidDeltaTokenError(error)) {
      throw new OutlookDeltaSyncError('MAIL_SYNC_CHECKPOINT_INVALID', 'outlook delta token invalid');
    }
    throw error;
  } finally {
    ownedRateLimiter?.destroy();
  }
}

export class MemoryOutlookDeltaTokenStore implements OutlookDeltaTokenStore {
  private readonly checkpoints = new Map<string, OutlookDeltaCheckpoint>();

  async get(connectionId: string): Promise<OutlookDeltaCheckpoint | null> {
    return this.checkpoints.get(connectionId) ?? null;
  }

  async set(connectionId: string, checkpoint: OutlookDeltaCheckpoint): Promise<void> {
    this.checkpoints.set(connectionId, { ...checkpoint });
  }
}

export class MemoryOutlookMessageStore implements OutlookMessageStore {
  private readonly records = new Map<string, Map<string, NormalizedMailMessage>>();

  async upsert(
    connectionId: string,
    messages: NormalizedMailMessage[]
  ): Promise<{ upserted: number; skipped: number }> {
    let store = this.records.get(connectionId);
    if (!store) {
      store = new Map<string, NormalizedMailMessage>();
      this.records.set(connectionId, store);
    }

    let upserted = 0;
    let skipped = 0;
    for (const message of messages) {
      if (store.has(message.providerMessageId)) {
        skipped += 1;
        continue;
      }
      store.set(message.providerMessageId, message);
      upserted += 1;
    }

    return { upserted, skipped };
  }

  list(connectionId: string): NormalizedMailMessage[] {
    return [...(this.records.get(connectionId)?.values() ?? [])];
  }
}

function assertReadPolicy(
  policyRegistry: ProviderPolicyRegistry,
  featureMode: ProviderFeatureMode | undefined
): void {
  const operation = featureMode === 'full-body' ? 'mail.read.fullbody' : 'mail.read.metadata';
  try {
    policyRegistry.assertOperationAllowed({
      providerId: 'microsoft',
      operation,
      featureMode,
    });
  } catch (error) {
    if (error instanceof ProviderPolicyError) {
      throw new OutlookDeltaSyncError('PROVIDER_POLICY_BLOCKED', error.message);
    }
    throw error;
  }
}

function clampMaxMessages(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 100;
  }

  const asInteger = Math.floor(value);
  if (asInteger < 1) {
    return 1;
  }

  return Math.min(asInteger, 500);
}

function isInvalidDeltaTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const asRecord = error as Record<string, unknown>;
  if (asRecord.code === 'MAIL_SYNC_CHECKPOINT_INVALID') {
    return true;
  }

  if (asRecord.status === 404 || asRecord.status === 410) {
    return true;
  }

  const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';
  return message.includes('delta') && (message.includes('invalid') || message.includes('expired'));
}
