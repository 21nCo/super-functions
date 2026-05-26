import {
  createDefaultProviderPolicyRegistry,
  ProviderPolicyError,
  type ProviderFeatureMode,
  type ProviderPolicyRegistry,
} from '@superfunctions/oauth-providers';

export interface GmailWatchState {
  connectionId: string;
  topicName: string;
  historyId: string;
  expiration: string;
  watchId?: string;
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface GmailWatchStore {
  get(connectionId: string): Promise<GmailWatchState | null>;
  set(connectionId: string, state: GmailWatchState): Promise<void>;
}

export interface GmailWatchClient {
  createWatch(input: {
    topicName: string;
    labelIds?: string[];
    labelFilterAction?: 'include' | 'exclude';
  }): Promise<{
    historyId: string;
    expiration: string | number;
    watchId?: string;
  }>;
}

export interface EnsureGmailWatchRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  topicName: string;
  labelIds?: string[];
  labelFilterAction?: 'include' | 'exclude';
  renewThresholdMs?: number;
  forceRenew?: boolean;
  featureMode?: ProviderFeatureMode;
}

export interface EnsureGmailWatchDependencies {
  watchStore: GmailWatchStore;
  watchClient: GmailWatchClient;
  policyRegistry?: ProviderPolicyRegistry;
  now?: () => Date;
}

export interface EnsureGmailWatchResult {
  watch: GmailWatchState;
  renewed: boolean;
}

export interface GmailPushPayload {
  historyId: string;
  emailAddress?: string;
}

export interface HandleGmailPushRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  payload: unknown;
}

export interface HandleGmailPushDependencies {
  watchStore: GmailWatchStore;
  triggerIncrementalSync: (input: {
    tenantId: string;
    userId: string;
    connectionId: string;
    historyId: string;
  }) => Promise<void>;
  now?: () => Date;
}

export class GmailWatchError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'GmailWatchError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export async function ensureGmailWatch(
  request: EnsureGmailWatchRequest,
  dependencies: EnsureGmailWatchDependencies
): Promise<EnsureGmailWatchResult> {
  const now = dependencies.now ?? (() => new Date());
  const policyRegistry = dependencies.policyRegistry ?? createDefaultProviderPolicyRegistry();
  let policyVersion = 'unknown';

  try {
    const decision = policyRegistry.assertOperationAllowed({
      providerId: 'google',
      operation: 'mail.watch.create',
      featureMode: request.featureMode,
    });
    policyVersion = decision.policyVersion;
  } catch (error) {
    if (error instanceof ProviderPolicyError) {
      throw new GmailWatchError('PROVIDER_POLICY_BLOCKED', error.message);
    }
    throw error;
  }

  const existing = await dependencies.watchStore.get(request.connectionId);
  const renewThresholdMs = request.renewThresholdMs ?? 5 * 60 * 1000;
  if (
    existing &&
    request.forceRenew !== true &&
    !isWatchRenewalDue(existing.expiration, now(), renewThresholdMs)
  ) {
    return {
      watch: existing,
      renewed: false,
    };
  }

  const created = await dependencies.watchClient.createWatch({
    topicName: request.topicName,
    labelIds: request.labelIds,
    labelFilterAction: request.labelFilterAction,
  });

  const timestamp = now().toISOString();
  const state: GmailWatchState = {
    connectionId: request.connectionId,
    topicName: request.topicName,
    historyId: created.historyId,
    expiration: normalizeExpiration(created.expiration),
    watchId: created.watchId,
    policyVersion,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await dependencies.watchStore.set(request.connectionId, state);

  return {
    watch: state,
    renewed: existing !== null,
  };
}

export async function handleGmailPushNotification(
  request: HandleGmailPushRequest,
  dependencies: HandleGmailPushDependencies
): Promise<{
  triggered: boolean;
  historyId: string;
}> {
  const now = dependencies.now ?? (() => new Date());
  const state = await dependencies.watchStore.get(request.connectionId);
  if (!state) {
    throw new GmailWatchError('VALIDATION_ERROR', 'watch state not found for connection');
  }

  const payload = parseGmailPushPayload(request.payload);
  await dependencies.triggerIncrementalSync({
    tenantId: request.tenantId,
    userId: request.userId,
    connectionId: request.connectionId,
    historyId: payload.historyId,
  });

  const updatedState: GmailWatchState = {
    ...state,
    historyId: payload.historyId,
    updatedAt: now().toISOString(),
  };
  await dependencies.watchStore.set(request.connectionId, updatedState);

  return {
    triggered: true,
    historyId: payload.historyId,
  };
}

export function parseGmailPushPayload(payload: unknown): GmailPushPayload {
  if (!payload || typeof payload !== 'object') {
    throw new GmailWatchError('VALIDATION_ERROR', 'invalid gmail push payload');
  }

  const asRecord = payload as Record<string, unknown>;
  if (typeof asRecord.historyId === 'string' && asRecord.historyId.length > 0) {
    return {
      historyId: asRecord.historyId,
      emailAddress:
        typeof asRecord.emailAddress === 'string' ? asRecord.emailAddress : undefined,
    };
  }

  const message = asRecord.message;
  if (message && typeof message === 'object') {
    const data = (message as Record<string, unknown>).data;
    if (typeof data === 'string' && data.length > 0) {
      const decoded = decodeBase64(data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(decoded);
      } catch {
        throw new GmailWatchError('VALIDATION_ERROR', 'gmail push payload data must be valid JSON');
      }

      if (parsed && typeof parsed === 'object') {
        const parsedRecord = parsed as Record<string, unknown>;
        const historyId = parsedRecord.historyId;
        if (typeof historyId === 'string' && historyId.length > 0) {
          return {
            historyId,
            emailAddress:
              typeof parsedRecord.emailAddress === 'string'
                ? parsedRecord.emailAddress
                : undefined,
          };
        }
      }
    }
  }

  throw new GmailWatchError('VALIDATION_ERROR', 'gmail push payload historyId is required');
}

export function isWatchRenewalDue(
  expirationIso: string,
  now: Date,
  renewThresholdMs: number
): boolean {
  const expirationMs = Date.parse(expirationIso);
  if (Number.isNaN(expirationMs)) {
    return true;
  }
  return expirationMs - now.getTime() <= renewThresholdMs;
}

export class MemoryGmailWatchStore implements GmailWatchStore {
  private readonly records = new Map<string, GmailWatchState>();

  async get(connectionId: string): Promise<GmailWatchState | null> {
    return this.records.get(connectionId) ?? null;
  }

  async set(connectionId: string, state: GmailWatchState): Promise<void> {
    this.records.set(connectionId, { ...state });
  }
}

function normalizeExpiration(value: string | number): string {
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString();
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  throw new GmailWatchError('VALIDATION_ERROR', 'invalid gmail watch expiration value');
}

function decodeBase64(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder);
  return Buffer.from(padded, 'base64').toString('utf8');
}
