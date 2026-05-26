export interface SendScope {
  tenantId: string;
  userId: string;
}

export interface SendRequest extends SendScope {
  providerId: string;
  recipientCount: number;
  idempotencyKey: string;
  destinationDomains?: string[];
  abuseScore?: number;
  payload?: {
    subject?: string;
    bodyText?: string;
  };
}

export interface SendPolicyDecision {
  allowed: boolean;
  code?: 'MAIL_SEND_BLOCKED';
  message?: string;
  retryable: boolean;
  reason?: string;
  matchedPolicy?: string;
}

export interface SendBlockedDecision {
  decisionId: string;
  tenantId: string;
  userId: string;
  providerId: string;
  idempotencyKey: string;
  code: 'MAIL_SEND_BLOCKED';
  message: string;
  retryable: boolean;
  reason?: string;
  blockedAt: string;
}

export interface SendJobError {
  code: 'MAIL_SEND_BLOCKED' | 'PROVIDER_RATE_LIMITED' | 'TENANT_ACCESS_DENIED' | 'VALIDATION_ERROR';
  message: string;
  retryable: boolean;
}

export type SendJobStatus = 'queued' | 'processing' | 'sent' | 'failed';

export interface SendJob extends SendRequest {
  jobId: string;
  status: SendJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: SendJobError;
}

export interface SendQueueResult {
  queued: true;
  jobId: string;
  policyPassed: true;
  duplicate: boolean;
}

export class SendGovernanceError extends Error {
  readonly code:
    | 'MAIL_SEND_BLOCKED'
    | 'PROVIDER_RATE_LIMITED'
    | 'TENANT_ACCESS_DENIED'
    | 'VALIDATION_ERROR';
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code:
      | 'MAIL_SEND_BLOCKED'
      | 'PROVIDER_RATE_LIMITED'
      | 'TENANT_ACCESS_DENIED'
      | 'VALIDATION_ERROR',
    message: string,
    retryable = false
  ) {
    super(message);
    this.name = 'SendGovernanceError';
    this.code = code;
    this.retryable = retryable;
    this.status =
      code === 'TENANT_ACCESS_DENIED'
        ? 403
        : code === 'PROVIDER_RATE_LIMITED'
          ? 429
          : code === 'MAIL_SEND_BLOCKED'
            ? 429
            : 400;
  }
}

export interface SendProcessResult {
  sent: boolean;
  jobId: string;
  retries: number;
}

export function assertSendScope(scope: SendScope): void {
  if (!scope.tenantId || scope.tenantId.trim().length === 0) {
    throw new SendGovernanceError('VALIDATION_ERROR', 'tenantId is required');
  }
  if (!scope.userId || scope.userId.trim().length === 0) {
    throw new SendGovernanceError('VALIDATION_ERROR', 'userId is required');
  }
}

export function assertSendRequest(request: SendRequest): void {
  assertSendScope(request);
  if (!request.providerId || request.providerId.trim().length === 0) {
    throw new SendGovernanceError('VALIDATION_ERROR', 'providerId is required');
  }
  if (!request.idempotencyKey || request.idempotencyKey.trim().length === 0) {
    throw new SendGovernanceError('VALIDATION_ERROR', 'idempotencyKey is required');
  }
  if (!Number.isFinite(request.recipientCount) || request.recipientCount <= 0) {
    throw new SendGovernanceError('VALIDATION_ERROR', 'recipientCount must be positive');
  }
}

export function assertTenantUserAccess(request: SendScope, storedScope: SendScope): void {
  if (request.tenantId !== storedScope.tenantId || request.userId !== storedScope.userId) {
    throw new SendGovernanceError('TENANT_ACCESS_DENIED', 'cross-tenant access denied');
  }
}
