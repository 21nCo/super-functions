import {
  SendGovernanceError,
  type SendRequest,
  type SendJob,
  type SendJobError,
  type SendJobStatus,
  type SendScope,
  assertSendRequest,
  assertSendScope,
  assertTenantUserAccess,
} from './types.js';

interface QueueDependencies {
  now?: () => string;
}

export interface QueueEnqueueResult {
  job: SendJob;
  duplicate: boolean;
}

export class SendQueue {
  private readonly now: () => string;
  private readonly jobByScopeAndId = new Map<string, SendJob>();
  private readonly jobScopeByJobId = new Map<string, SendScope>();
  private readonly idempotencyByScope = new Map<string, string>();

  constructor(dependencies: QueueDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  enqueue(request: SendRequest): QueueEnqueueResult {
    assertSendRequest(request);

    const idempotencyKey = scopedIdempotencyKey(request);
    const existingJobId = this.idempotencyByScope.get(idempotencyKey);
    if (existingJobId) {
      const existing = this.mustGetByScopedId(existingJobId, request);
      return {
        job: existing,
        duplicate: true,
      };
    }

    const timestamp = this.now();
    const jobId = createSendJobId(request.providerId, request.idempotencyKey);
    const job: SendJob = {
      ...request,
      jobId,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 0,
    };

    this.jobByScopeAndId.set(scopedJobId(jobId, request), job);
    this.jobScopeByJobId.set(jobId, { tenantId: request.tenantId, userId: request.userId });
    this.idempotencyByScope.set(idempotencyKey, jobId);

    return {
      job,
      duplicate: false,
    };
  }

  get(jobId: string, scope: SendScope): SendJob | undefined {
    assertSendScope(scope);
    const existingScope = this.jobScopeByJobId.get(jobId);
    if (!existingScope) {
      return undefined;
    }

    assertTenantUserAccess(scope, existingScope);
    return this.jobByScopeAndId.get(scopedJobId(jobId, scope));
  }

  list(scope: SendScope): SendJob[] {
    assertSendScope(scope);
    const prefix = scopedPrefix(scope);
    return [...this.jobByScopeAndId.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  }

  updateStatus(jobId: string, scope: SendScope, status: SendJobStatus, error?: SendJobError): SendJob {
    const job = this.get(jobId, scope);
    if (!job) {
      throw new SendGovernanceError('VALIDATION_ERROR', `send job not found: ${jobId}`);
    }

    const updated: SendJob = {
      ...job,
      status,
      attempts: job.attempts + 1,
      updatedAt: this.now(),
      lastError: error,
    };

    this.jobByScopeAndId.set(scopedJobId(jobId, scope), updated);
    return updated;
  }

  private mustGetByScopedId(jobId: string, scope: SendScope): SendJob {
    const job = this.jobByScopeAndId.get(scopedJobId(jobId, scope));
    if (!job) {
      throw new SendGovernanceError('VALIDATION_ERROR', `send job not found: ${jobId}`);
    }
    return job;
  }
}

function scopedPrefix(scope: SendScope): string {
  return `${scope.tenantId}:${scope.userId}:`;
}

function scopedJobId(jobId: string, scope: SendScope): string {
  return `${scope.tenantId}:${scope.userId}:${jobId}`;
}

function scopedIdempotencyKey(request: SendRequest): string {
  return `${request.tenantId}:${request.userId}:${request.providerId}:${request.idempotencyKey}`;
}

function createSendJobId(providerId: string, idempotencyKey: string): string {
  const entropy = Math.random().toString(36).slice(2, 10);
  const provider = providerId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8);
  const idem = idempotencyKey.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8);
  return `send_${provider}_${idem}_${entropy}`;
}
