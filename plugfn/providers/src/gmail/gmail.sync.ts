import {
  createDefaultProviderPolicyRegistry,
  ProviderPolicyError,
  type ProviderFeatureMode,
  type ProviderPolicyRegistry,
} from '@superfunctions/oauth-providers';
import {
  normalizeGmailMessages,
  type GmailApiMessage,
  type NormalizedMailMessage,
} from 'plugfn';

export type MailSyncMode = 'full' | 'incremental';

export interface GmailSyncRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  mode: MailSyncMode;
  checkpoint?: string;
  maxMessages?: number;
  featureMode?: ProviderFeatureMode;
}

export interface GmailSyncCheckpoint {
  historyId: string;
  updatedAt: string;
}

export interface GmailSyncResult {
  checkpoint: string;
  fetched: number;
  upserted: number;
  skipped: number;
  partial: boolean;
  messages: NormalizedMailMessage[];
}

export interface GmailCheckpointStore {
  get(connectionId: string): Promise<GmailSyncCheckpoint | null>;
  set(connectionId: string, checkpoint: GmailSyncCheckpoint): Promise<void>;
}

export interface GmailMessageStore {
  upsert(
    connectionId: string,
    messages: NormalizedMailMessage[]
  ): Promise<{ upserted: number; skipped: number }>;
}

export interface GmailSyncSource {
  listBaseline(input: {
    maxMessages: number;
    pageToken?: string;
  }): Promise<{
    messages: GmailApiMessage[];
    nextPageToken?: string;
    historyId?: string;
  }>;
  listIncremental(input: {
    startHistoryId: string;
    maxMessages: number;
  }): Promise<{
    messages: GmailApiMessage[];
    historyId: string;
    partial?: boolean;
  }>;
}

export interface RunGmailSyncDependencies {
  source: GmailSyncSource;
  checkpointStore: GmailCheckpointStore;
  messageStore?: GmailMessageStore;
  policyRegistry?: ProviderPolicyRegistry;
  now?: () => string;
}

export class GmailSyncError extends Error {
  readonly code: 'MAIL_SYNC_CHECKPOINT_INVALID' | 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: 'MAIL_SYNC_CHECKPOINT_INVALID' | 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'GmailSyncError';
    this.code = code;
    this.status = code === 'MAIL_SYNC_CHECKPOINT_INVALID' ? 409 : 400;
    this.retryable = code !== 'PROVIDER_POLICY_BLOCKED';
  }
}

export async function runGmailSync(
  request: GmailSyncRequest,
  dependencies: RunGmailSyncDependencies
): Promise<GmailSyncResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const policyRegistry = dependencies.policyRegistry ?? createDefaultProviderPolicyRegistry();
  assertReadPolicy(policyRegistry, request.featureMode);
  const maxMessages = clampMaxMessages(request.maxMessages);
  const messageStore = dependencies.messageStore ?? new MemoryGmailMessageStore();

  if (request.mode === 'full') {
    const baselineMessages: GmailApiMessage[] = [];
    const seenPageTokens = new Set<string>();
    let pageToken: string | undefined;
    let baselineHistoryId: string | undefined;

    do {
      const baseline = await dependencies.source.listBaseline({ maxMessages, pageToken });
      baselineMessages.push(...baseline.messages);
      baselineHistoryId = baseline.historyId ?? baselineHistoryId;
      const nextPageToken = baseline.nextPageToken;
      if (!nextPageToken) {
        pageToken = undefined;
        break;
      }
      if (seenPageTokens.has(nextPageToken)) {
        throw new GmailSyncError(
          'VALIDATION_ERROR',
          'gmail baseline pagination repeated a page token'
        );
      }
      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);

    const normalizedMessages = normalizeGmailMessages(baselineMessages, {
      mailbox: 'inbox',
    });
    const writeResult = await messageStore.upsert(request.connectionId, normalizedMessages);
    const checkpoint = baselineHistoryId ?? extractHistoryId(baselineMessages) ?? '0';

    await dependencies.checkpointStore.set(request.connectionId, {
      historyId: checkpoint,
      updatedAt: now(),
    });

    return {
      checkpoint,
      fetched: normalizedMessages.length,
      upserted: writeResult.upserted,
      skipped: writeResult.skipped,
      partial: false,
      messages: normalizedMessages,
    };
  }

  const checkpoint = request.checkpoint
    ? { historyId: request.checkpoint, updatedAt: now() }
    : await dependencies.checkpointStore.get(request.connectionId);
  if (!checkpoint || !checkpoint.historyId) {
    throw new GmailSyncError(
      'MAIL_SYNC_CHECKPOINT_INVALID',
      'gmail checkpoint invalid; rebaseline required'
    );
  }

  let incremental: Awaited<ReturnType<GmailSyncSource['listIncremental']>>;
  try {
    incremental = await dependencies.source.listIncremental({
      startHistoryId: checkpoint.historyId,
      maxMessages,
    });
  } catch (error) {
    if (isInvalidCheckpointError(error)) {
      throw new GmailSyncError(
        'MAIL_SYNC_CHECKPOINT_INVALID',
        'gmail checkpoint invalid; rebaseline required'
      );
    }
    throw error;
  }

  const normalizedMessages = normalizeGmailMessages(incremental.messages, {
    mailbox: 'inbox',
  });
  const writeResult = await messageStore.upsert(request.connectionId, normalizedMessages);

  await dependencies.checkpointStore.set(request.connectionId, {
    historyId: incremental.historyId,
    updatedAt: now(),
  });

  return {
    checkpoint: incremental.historyId,
    fetched: normalizedMessages.length,
    upserted: writeResult.upserted,
    skipped: writeResult.skipped,
    partial: incremental.partial === true,
    messages: normalizedMessages,
  };
}

export class MemoryGmailCheckpointStore implements GmailCheckpointStore {
  private readonly checkpoints = new Map<string, GmailSyncCheckpoint>();

  async get(connectionId: string): Promise<GmailSyncCheckpoint | null> {
    return this.checkpoints.get(connectionId) ?? null;
  }

  async set(connectionId: string, checkpoint: GmailSyncCheckpoint): Promise<void> {
    this.checkpoints.set(connectionId, { ...checkpoint });
  }
}

export class MemoryGmailMessageStore implements GmailMessageStore {
  private readonly messagesByConnection = new Map<string, Map<string, NormalizedMailMessage>>();

  async upsert(
    connectionId: string,
    messages: NormalizedMailMessage[]
  ): Promise<{ upserted: number; skipped: number }> {
    let connectionStore = this.messagesByConnection.get(connectionId);
    if (!connectionStore) {
      connectionStore = new Map<string, NormalizedMailMessage>();
      this.messagesByConnection.set(connectionId, connectionStore);
    }

    let upserted = 0;
    let skipped = 0;
    for (const message of messages) {
      if (connectionStore.has(message.providerMessageId)) {
        skipped += 1;
        continue;
      }

      connectionStore.set(message.providerMessageId, message);
      upserted += 1;
    }

    return {
      upserted,
      skipped,
    };
  }

  list(connectionId: string): NormalizedMailMessage[] {
    return [...(this.messagesByConnection.get(connectionId)?.values() ?? [])];
  }
}

function assertReadPolicy(
  policyRegistry: ProviderPolicyRegistry,
  featureMode: ProviderFeatureMode | undefined
): void {
  const operation = featureMode === 'full-body' ? 'mail.read.fullbody' : 'mail.read.metadata';
  try {
    policyRegistry.assertOperationAllowed({
      providerId: 'google',
      operation,
      featureMode,
    });
  } catch (error) {
    if (error instanceof ProviderPolicyError) {
      throw new GmailSyncError('PROVIDER_POLICY_BLOCKED', error.message);
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

function extractHistoryId(messages: GmailApiMessage[]): string | undefined {
  for (const message of messages) {
    if (typeof message.historyId === 'string' && message.historyId.length > 0) {
      return message.historyId;
    }
  }
  return undefined;
}

function isInvalidCheckpointError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const asRecord = error as Record<string, unknown>;
  if (asRecord.code === 'MAIL_SYNC_CHECKPOINT_INVALID') {
    return true;
  }

  if (asRecord.status === 404) {
    return true;
  }

  const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';
  return message.includes('history') && message.includes('invalid');
}
