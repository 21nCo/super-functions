import { assertValidScope, type TenantUserScope } from './isolation-guards.js';

export type ManagedMailboxSecurityMode = 'non-recoverable' | 'escrow-recoverable';

export interface ManagedMailboxSecurityMetadata extends TenantUserScope {
  managedMailboxId: string;
  securityMode: ManagedMailboxSecurityMode;
  serverSideRecoveryAllowed: boolean;
  serverSideAiParsingAllowed: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface ManagedMailboxSecurityAuditEvent {
  event: 'managed-mailbox-mode-set' | 'managed-mailbox-escrow-recovery';
  managedMailboxId: string;
  tenantId: string;
  userId: string;
  securityMode: ManagedMailboxSecurityMode;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface SetManagedMailboxSecurityModeInput extends TenantUserScope {
  managedMailboxId: string;
  mode: ManagedMailboxSecurityMode | null | undefined;
  actor: string;
  reason: string;
}

export interface EscrowRecoveryInput {
  managedMailboxId: string;
  actor: string;
  reason: string;
}

export class ManagedMailboxSecurityError extends Error {
  readonly code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED';
  readonly status: number;

  constructor(code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED', message: string) {
    super(message);
    this.name = 'ManagedMailboxSecurityError';
    this.code = code;
    this.status = code === 'VALIDATION_ERROR' ? 400 : 403;
  }
}

export function assertManagedMailboxSecurityMode(mode: unknown): ManagedMailboxSecurityMode {
  if (mode !== 'non-recoverable' && mode !== 'escrow-recoverable') {
    throw new ManagedMailboxSecurityError(
      'VALIDATION_ERROR',
      'managed mailbox security mode is required'
    );
  }
  return mode;
}

export function buildManagedMailboxSecurityMetadata(
  input: SetManagedMailboxSecurityModeInput,
  timestamp: string
): ManagedMailboxSecurityMetadata {
  assertValidScope(input);
  assertIsoTimestamp(timestamp, 'timestamp');

  const mode = assertManagedMailboxSecurityMode(input.mode);
  const managedMailboxId = assertNonEmpty(input.managedMailboxId, 'managedMailboxId');
  const actor = assertNonEmpty(input.actor, 'actor');
  assertNonEmpty(input.reason, 'reason');

  const serverSideRecoveryAllowed = mode === 'escrow-recoverable';

  return {
    managedMailboxId,
    tenantId: input.tenantId,
    userId: input.userId,
    securityMode: mode,
    serverSideRecoveryAllowed,
    serverSideAiParsingAllowed: serverSideRecoveryAllowed,
    updatedAt: timestamp,
    updatedBy: actor,
  };
}

export class ManagedMailboxSecurityService {
  private readonly metadataByMailbox = new Map<string, ManagedMailboxSecurityMetadata>();
  private readonly auditEvents: ManagedMailboxSecurityAuditEvent[] = [];

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  setMode(input: SetManagedMailboxSecurityModeInput): ManagedMailboxSecurityMetadata {
    const timestamp = this.now();
    const metadata = buildManagedMailboxSecurityMetadata(input, timestamp);

    this.metadataByMailbox.set(metadata.managedMailboxId, metadata);
    this.auditEvents.push({
      event: 'managed-mailbox-mode-set',
      managedMailboxId: metadata.managedMailboxId,
      tenantId: metadata.tenantId,
      userId: metadata.userId,
      securityMode: metadata.securityMode,
      actor: assertNonEmpty(input.actor, 'actor'),
      reason: assertNonEmpty(input.reason, 'reason'),
      timestamp,
    });

    return metadata;
  }

  getMetadata(managedMailboxId: string): ManagedMailboxSecurityMetadata | null {
    return this.metadataByMailbox.get(managedMailboxId) ?? null;
  }

  recordEscrowRecovery(input: EscrowRecoveryInput): ManagedMailboxSecurityAuditEvent {
    const managedMailboxId = assertNonEmpty(input.managedMailboxId, 'managedMailboxId');
    const actor = assertNonEmpty(input.actor, 'actor');
    const reason = assertNonEmpty(input.reason, 'reason');

    const metadata = this.metadataByMailbox.get(managedMailboxId);
    if (!metadata) {
      throw new ManagedMailboxSecurityError(
        'VALIDATION_ERROR',
        'managed mailbox security metadata not found'
      );
    }

    if (!metadata.serverSideRecoveryAllowed || metadata.securityMode !== 'escrow-recoverable') {
      throw new ManagedMailboxSecurityError(
        'PROVIDER_POLICY_BLOCKED',
        'server-side recovery disabled for non-recoverable mode'
      );
    }

    const event: ManagedMailboxSecurityAuditEvent = {
      event: 'managed-mailbox-escrow-recovery',
      managedMailboxId,
      tenantId: metadata.tenantId,
      userId: metadata.userId,
      securityMode: metadata.securityMode,
      actor,
      reason,
      timestamp: this.now(),
    };

    this.auditEvents.push(event);
    return event;
  }

  listAuditEvents(managedMailboxId?: string): ManagedMailboxSecurityAuditEvent[] {
    if (!managedMailboxId) {
      return [...this.auditEvents];
    }
    return this.auditEvents.filter((event) => event.managedMailboxId === managedMailboxId);
  }
}

function assertNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ManagedMailboxSecurityError('VALIDATION_ERROR', `${field} is required`);
  }
  return normalized;
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new ManagedMailboxSecurityError('VALIDATION_ERROR', `${field} must be an ISO timestamp`);
  }
}
