import { RateLimiter } from '../middleware/rate-limiter.js';
import { ProviderRateLimitedError, RetryMiddleware } from '../middleware/retry.js';
import { SendQueue } from './queue.js';
import { defaultSendPolicyModel, evaluateSendPolicy, type SendPolicyModel } from './policies.js';
import {
  SendGovernanceError,
  type SendRequest,
  type SendBlockedDecision,
  type SendProcessResult,
  type SendQueueResult,
  type SendScope,
} from './types.js';

interface SendGovernorDependencies {
  queue?: SendQueue;
  policies?: SendPolicyModel;
  now?: () => string;
  retryMiddleware?: RetryMiddleware;
  rateLimiter?: RateLimiter;
}

export interface SendTransport {
  send(input: {
    providerId: string;
    tenantId: string;
    userId: string;
    jobId: string;
    payload?: SendRequest['payload'];
  }): Promise<{ providerMessageId?: string }>;
}

export class SendGovernor {
  private readonly queue: SendQueue;
  private readonly policies: SendPolicyModel;
  private readonly now: () => string;
  private readonly retryMiddleware: RetryMiddleware;
  private readonly rateLimiter: RateLimiter;
  private readonly blockedByScope = new Map<string, SendBlockedDecision[]>();

  constructor(dependencies: SendGovernorDependencies = {}) {
    this.queue = dependencies.queue ?? new SendQueue({ now: dependencies.now });
    this.policies = dependencies.policies ?? defaultSendPolicyModel;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.retryMiddleware = dependencies.retryMiddleware ?? new RetryMiddleware();
    this.rateLimiter = dependencies.rateLimiter ?? new RateLimiter();
  }

  async scheduleSend(request: SendRequest): Promise<SendQueueResult> {
    const decision = evaluateSendPolicy(request, this.policies);
    if (!decision.allowed) {
      this.persistBlockedDecision({
        decisionId: buildDecisionId(request),
        tenantId: request.tenantId,
        userId: request.userId,
        providerId: request.providerId,
        idempotencyKey: request.idempotencyKey,
        code: 'MAIL_SEND_BLOCKED',
        message: decision.message ?? 'send policy limit exceeded',
        retryable: decision.retryable,
        reason: decision.reason,
        blockedAt: this.now(),
      });

      throw new SendGovernanceError(
        'MAIL_SEND_BLOCKED',
        decision.message ?? 'send policy limit exceeded',
        decision.retryable
      );
    }

    const queued = await this.queue.enqueue(request);
    return {
      queued: true,
      jobId: queued.job.jobId,
      policyPassed: true,
      duplicate: queued.duplicate,
    };
  }

  async processQueuedSend(
    input: {
      jobId: string;
      scope: SendScope;
      transport: SendTransport;
    }
  ): Promise<SendProcessResult> {
    const job = this.queue.get(input.jobId, input.scope);
    if (!job) {
      throw new SendGovernanceError('VALIDATION_ERROR', `send job not found: ${input.jobId}`);
    }
    if (job.status !== 'queued') {
      throw new SendGovernanceError(
        'VALIDATION_ERROR',
        `send job is not queued: ${input.jobId} (${job.status})`
      );
    }

    const providerLimitConfig = {
      requests: 1,
      window: 60000,
    };
    this.queue.updateStatus(job.jobId, input.scope, 'processing');
    try {
      await this.rateLimiter.acquireMany(
        [
          `provider:${job.providerId}`,
          `provider:${job.providerId}:tenant:${job.tenantId}`,
        ],
        providerLimitConfig
      );
    } catch (error) {
      this.queue.updateStatus(job.jobId, input.scope, 'queued');
      throw error;
    }

    try {
      const result = await this.retryMiddleware.execute(
        () =>
          input.transport.send({
            providerId: job.providerId,
            tenantId: job.tenantId,
            userId: job.userId,
            jobId: job.jobId,
            payload: job.payload,
          }),
        `send:${job.jobId}`
      );

      this.queue.updateStatus(job.jobId, input.scope, 'sent');
      return {
        sent: true,
        jobId: job.jobId,
        retries: result.retries,
      };
    } catch (error) {
      if (error instanceof ProviderRateLimitedError) {
        this.queue.updateStatus(job.jobId, input.scope, 'failed', {
          code: 'PROVIDER_RATE_LIMITED',
          message: error.message,
          retryable: false,
        });
        throw new SendGovernanceError('PROVIDER_RATE_LIMITED', error.message);
      }

      this.queue.updateStatus(job.jobId, input.scope, 'failed', {
        code: 'VALIDATION_ERROR',
        message: (error as Error).message,
        retryable: false,
      });
      throw error;
    }
  }

  getQueuedSend(jobId: string, scope: SendScope) {
    return this.queue.get(jobId, scope);
  }

  listQueuedSends(scope: SendScope) {
    return this.queue.list(scope);
  }

  listBlockedDecisions(scope: SendScope): SendBlockedDecision[] {
    return [...(this.blockedByScope.get(scopeKey(scope)) ?? [])];
  }

  wouldExceedRateLimit(providerId: string, tenantId: string): { provider: boolean; tenant: boolean } {
    const config = {
      requests: 1,
      window: 60000,
    };
    return {
      provider: this.rateLimiter.wouldExceed(`provider:${providerId}`, config),
      tenant: this.rateLimiter.wouldExceed(`provider:${providerId}:tenant:${tenantId}`, config),
    };
  }

  private persistBlockedDecision(decision: SendBlockedDecision): void {
    const key = scopeKey(decision);
    const existing = this.blockedByScope.get(key) ?? [];
    this.blockedByScope.set(key, [...existing, decision]);
  }
}

function buildDecisionId(request: SendRequest): string {
  const entropy = Math.random().toString(36).slice(2, 10);
  return `blocked_${request.providerId}_${request.idempotencyKey}_${entropy}`;
}

function scopeKey(scope: SendScope): string {
  return `${scope.tenantId}:${scope.userId}`;
}
