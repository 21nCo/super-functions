import {
  BackupChannelError,
  type BackupAlertEvent,
  type BackupChannel,
  assertBackupChannelConfirmed,
  buildBackupAlertEvent,
} from './backup-channel.js';

export interface ManagedMailboxSetupInput {
  financeCritical: boolean;
  userOptIn: boolean;
  riskAck: boolean;
  backupChannel: BackupChannel;
  now?: () => string;
}

export interface ManagedMailboxState {
  managedMailboxEnabled: boolean;
  financeCritical: boolean;
  userOptIn: boolean;
  riskAck: boolean;
  backupChannel: BackupChannel;
  enabledAt: string;
}

export interface ManagedMailboxSetupResult {
  state: ManagedMailboxState;
  transitions: string[];
  backupChannel: 'confirmed';
}

export interface ManagedMailboxIncidentInput {
  state: ManagedMailboxState;
  severity: 'critical' | 'warning';
  incidentCode: string;
  message: string;
  now?: () => string;
}

export interface ManagedMailboxIncidentResult {
  alertTriggered: boolean;
  alert?: BackupAlertEvent;
  transitions: string[];
}

export class ManagedMailboxPolicyError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ManagedMailboxPolicyError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function enforceManagedMailboxSetup(
  input: ManagedMailboxSetupInput
): ManagedMailboxSetupResult {
  const timestamp = (input.now ?? (() => new Date().toISOString()))();

  if (!input.userOptIn) {
    throw new ManagedMailboxPolicyError(
      'PROVIDER_POLICY_BLOCKED',
      'managed mailbox requires explicit user opt-in'
    );
  }

  if (input.financeCritical && (!input.riskAck || !input.backupChannel.confirmed)) {
    throw new ManagedMailboxPolicyError(
      'PROVIDER_POLICY_BLOCKED',
      'backup channel and risk acknowledgment required'
    );
  }

  let backupChannel: BackupChannel;
  try {
    backupChannel = assertBackupChannelConfirmed(input.backupChannel);
  } catch (error) {
    if (error instanceof BackupChannelError) {
      throw new ManagedMailboxPolicyError(error.code, error.message);
    }
    throw error;
  }

  const state: ManagedMailboxState = {
    managedMailboxEnabled: true,
    financeCritical: input.financeCritical,
    userOptIn: true,
    riskAck: input.riskAck,
    backupChannel,
    enabledAt: timestamp,
  };

  const transitions = ['managed-mail.opt-in-confirmed', 'managed-mail.enabled'];
  if (input.financeCritical) {
    transitions.push('managed-mail.finance-guardrails-confirmed');
  }

  return {
    state,
    transitions,
    backupChannel: 'confirmed',
  };
}

export function handleManagedMailboxIncident(
  input: ManagedMailboxIncidentInput
): ManagedMailboxIncidentResult {
  if (!input.state.managedMailboxEnabled) {
    throw new ManagedMailboxPolicyError(
      'VALIDATION_ERROR',
      'managed mailbox must be enabled before handling incidents'
    );
  }

  const transitions: string[] = ['managed-mail.incident-recorded'];
  if (input.severity !== 'critical') {
    return {
      alertTriggered: false,
      transitions,
    };
  }

  let alert: BackupAlertEvent;
  try {
    alert = buildBackupAlertEvent({
      channel: input.state.backupChannel,
      incidentCode: input.incidentCode,
      message: input.message,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof BackupChannelError) {
      throw new ManagedMailboxPolicyError(error.code, error.message);
    }
    throw error;
  }

  transitions.push('managed-mail.backup-alert-triggered');
  return {
    alertTriggered: true,
    alert,
    transitions,
  };
}
