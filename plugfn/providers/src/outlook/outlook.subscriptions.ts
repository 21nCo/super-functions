import {
  createDefaultProviderPolicyRegistry,
  ProviderPolicyError,
  type ProviderFeatureMode,
  type ProviderPolicyRegistry,
} from '@superfunctions/oauth-providers';
import { RetryMiddleware } from 'plugfn';
import { RateLimiter } from 'plugfn';

export interface OutlookSubscriptionState {
  connectionId: string;
  subscriptionId: string;
  resource: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutlookSubscriptionStore {
  get(connectionId: string): Promise<OutlookSubscriptionState | null>;
  set(connectionId: string, state: OutlookSubscriptionState): Promise<void>;
}

export interface OutlookSubscriptionClient {
  createOrRenew(input: {
    subscriptionId?: string;
    resource: string;
    notificationUrl: string;
    expirationDateTime?: string;
    clientState?: string;
  }): Promise<{
    subscriptionId: string;
    expirationDateTime: string;
  }>;
}

export interface EnsureOutlookSubscriptionRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  resource: string;
  notificationUrl: string;
  expirationDateTime?: string;
  clientState?: string;
  renewThresholdMs?: number;
  forceRenew?: boolean;
  featureMode?: ProviderFeatureMode;
}

export interface EnsureOutlookSubscriptionDependencies {
  subscriptionStore: OutlookSubscriptionStore;
  subscriptionClient: OutlookSubscriptionClient;
  policyRegistry?: ProviderPolicyRegistry;
  retryMiddleware?: RetryMiddleware;
  rateLimiter?: RateLimiter;
  rateLimitConfig?: {
    requests: number;
    window: number;
  };
  now?: () => Date;
}

export interface EnsureOutlookSubscriptionResult {
  subscription: OutlookSubscriptionState;
  renewed: boolean;
}

export interface HandleOutlookSubscriptionNotificationRequest {
  tenantId: string;
  userId: string;
  connectionId: string;
  payload: unknown;
}

export interface HandleOutlookSubscriptionNotificationDependencies {
  subscriptionStore: OutlookSubscriptionStore;
  triggerDeltaSync: (input: {
    tenantId: string;
    userId: string;
    connectionId: string;
  }) => Promise<void>;
}

export interface OutlookSubscriptionNotification {
  subscriptionId: string;
  resource: string;
}

export class OutlookSubscriptionError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'OutlookSubscriptionError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export async function ensureOutlookSubscription(
  request: EnsureOutlookSubscriptionRequest,
  dependencies: EnsureOutlookSubscriptionDependencies
): Promise<EnsureOutlookSubscriptionResult> {
  const now = dependencies.now ?? (() => new Date());
  const policyRegistry = dependencies.policyRegistry ?? createDefaultProviderPolicyRegistry();
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

  let policyVersion = 'unknown';
  try {
    const decision = policyRegistry.assertOperationAllowed({
      providerId: 'microsoft',
      operation: 'mail.watch.create',
      featureMode: request.featureMode,
    });
    policyVersion = decision.policyVersion;
  } catch (error) {
    if (error instanceof ProviderPolicyError) {
      throw new OutlookSubscriptionError('PROVIDER_POLICY_BLOCKED', error.message);
    }
    throw error;
  }

  const existing = await dependencies.subscriptionStore.get(request.connectionId);
  const renewThresholdMs = request.renewThresholdMs ?? 10 * 60 * 1000;
  if (
    existing &&
    request.forceRenew !== true &&
    !isOutlookSubscriptionRenewalDue(existing.expirationDateTime, now(), renewThresholdMs)
  ) {
    ownedRateLimiter?.destroy();
    return {
      subscription: existing,
      renewed: false,
    };
  }

  const timestamp = now().toISOString();
  try {
    const created = await createOrRecoverSubscription(
      request,
      existing,
      retryMiddleware,
      rateLimiter,
      rateLimitConfig,
      dependencies.subscriptionClient,
      request.tenantId
    );

    const state: OutlookSubscriptionState = {
      connectionId: request.connectionId,
      subscriptionId: created.subscriptionId,
      resource: request.resource,
      notificationUrl: request.notificationUrl,
      expirationDateTime: created.expirationDateTime,
      clientState: request.clientState,
      policyVersion,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await dependencies.subscriptionStore.set(request.connectionId, state);
    return {
      subscription: state,
      renewed: existing !== null,
    };
  } finally {
    ownedRateLimiter?.destroy();
  }
}

export async function handleOutlookSubscriptionNotification(
  request: HandleOutlookSubscriptionNotificationRequest,
  dependencies: HandleOutlookSubscriptionNotificationDependencies
): Promise<{
  triggered: boolean;
  count: number;
}> {
  const state = await dependencies.subscriptionStore.get(request.connectionId);
  if (!state) {
    throw new OutlookSubscriptionError(
      'VALIDATION_ERROR',
      'subscription state not found for connection'
    );
  }

  const notifications = parseOutlookSubscriptionNotifications(request.payload);
  const matching = notifications.filter((item) => item.subscriptionId === state.subscriptionId);
  if (matching.length === 0) {
    return {
      triggered: false,
      count: 0,
    };
  }

  await dependencies.triggerDeltaSync({
    tenantId: request.tenantId,
    userId: request.userId,
    connectionId: request.connectionId,
  });

  return {
    triggered: true,
    count: matching.length,
  };
}

export function parseOutlookSubscriptionNotifications(
  payload: unknown
): OutlookSubscriptionNotification[] {
  if (!payload || typeof payload !== 'object') {
    throw new OutlookSubscriptionError('VALIDATION_ERROR', 'invalid outlook subscription payload');
  }

  const entries = (payload as Record<string, unknown>).value;
  if (!Array.isArray(entries)) {
    throw new OutlookSubscriptionError('VALIDATION_ERROR', 'outlook subscription payload value[] required');
  }

  const notifications: OutlookSubscriptionNotification[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const asRecord = entry as Record<string, unknown>;
    const subscriptionId = asString(asRecord.subscriptionId);
    const resource = asString(asRecord.resource);
    if (!subscriptionId || !resource) {
      continue;
    }
    notifications.push({
      subscriptionId,
      resource,
    });
  }

  if (notifications.length === 0) {
    throw new OutlookSubscriptionError(
      'VALIDATION_ERROR',
      'outlook subscription payload must contain at least one valid notification'
    );
  }

  return notifications;
}

export function isOutlookSubscriptionRenewalDue(
  expirationDateTime: string,
  now: Date,
  renewThresholdMs: number
): boolean {
  const expirationMs = Date.parse(expirationDateTime);
  if (Number.isNaN(expirationMs)) {
    return true;
  }

  return expirationMs - now.getTime() <= renewThresholdMs;
}

export class MemoryOutlookSubscriptionStore implements OutlookSubscriptionStore {
  private readonly states = new Map<string, OutlookSubscriptionState>();

  async get(connectionId: string): Promise<OutlookSubscriptionState | null> {
    return this.states.get(connectionId) ?? null;
  }

  async set(connectionId: string, state: OutlookSubscriptionState): Promise<void> {
    this.states.set(connectionId, { ...state });
  }
}

async function createOrRecoverSubscription(
  request: EnsureOutlookSubscriptionRequest,
  existing: OutlookSubscriptionState | null,
  retryMiddleware: RetryMiddleware,
  rateLimiter: RateLimiter,
  rateLimitConfig: { requests: number; window: number },
  client: OutlookSubscriptionClient,
  tenantId: string
): Promise<{ subscriptionId: string; expirationDateTime: string }> {
  try {
    return await executeSubscriptionCall(
      request,
      existing?.subscriptionId,
      retryMiddleware,
      rateLimiter,
      rateLimitConfig,
      client,
      tenantId
    );
  } catch (error) {
    if (existing && isSubscriptionNotFound(error)) {
      return executeSubscriptionCall(
        request,
        undefined,
        retryMiddleware,
        rateLimiter,
        rateLimitConfig,
        client,
        tenantId
      );
    }
    throw error;
  }
}

async function executeSubscriptionCall(
  request: EnsureOutlookSubscriptionRequest,
  subscriptionId: string | undefined,
  retryMiddleware: RetryMiddleware,
  rateLimiter: RateLimiter,
  rateLimitConfig: { requests: number; window: number },
  client: OutlookSubscriptionClient,
  tenantId: string
): Promise<{ subscriptionId: string; expirationDateTime: string }> {
  const result = await retryMiddleware.execute(async () => {
    await rateLimiter.acquireMany(
      [
        'provider:outlook',
        `provider:outlook:tenant:${tenantId}`,
      ],
      rateLimitConfig
    );
    return client.createOrRenew({
      subscriptionId,
      resource: request.resource,
      notificationUrl: request.notificationUrl,
      expirationDateTime: request.expirationDateTime,
      clientState: request.clientState,
    });
  }, 'outlook.subscription');

  return result.data;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isSubscriptionNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const asRecord = error as Record<string, unknown>;
  if (asRecord.status === 404) {
    return true;
  }

  const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';
  return message.includes('not found') && message.includes('subscription');
}
