export type BackupChannelType = 'email' | 'phone' | 'webhook';

export interface BackupChannel {
  type: BackupChannelType;
  destination: string;
  confirmed: boolean;
}

export interface BackupAlertEvent {
  type: 'backup-alert';
  severity: 'critical';
  providerId: 'managed-mail';
  destination: string;
  incidentCode: string;
  message: string;
  timestamp: string;
}

export class BackupChannelError extends Error {
  readonly code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED';
  readonly status: number;

  constructor(code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED', message: string) {
    super(message);
    this.name = 'BackupChannelError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertBackupChannelConfirmed(channel: BackupChannel): BackupChannel {
  if (!channel || typeof channel !== 'object') {
    throw new BackupChannelError('VALIDATION_ERROR', 'backup channel is required');
  }

  if (!channel.destination || channel.destination.trim().length === 0) {
    throw new BackupChannelError('VALIDATION_ERROR', 'backup channel destination is required');
  }

  if (!channel.confirmed) {
    throw new BackupChannelError(
      'PROVIDER_POLICY_BLOCKED',
      'backup channel and risk acknowledgment required'
    );
  }

  return {
    type: channel.type,
    destination: channel.destination.trim(),
    confirmed: true,
  };
}

export function buildBackupAlertEvent(input: {
  channel: BackupChannel;
  incidentCode: string;
  message: string;
  now?: () => string;
}): BackupAlertEvent {
  const channel = assertBackupChannelConfirmed(input.channel);
  if (!input.incidentCode || input.incidentCode.trim().length === 0) {
    throw new BackupChannelError('VALIDATION_ERROR', 'incident code is required');
  }
  if (!input.message || input.message.trim().length === 0) {
    throw new BackupChannelError('VALIDATION_ERROR', 'backup alert message is required');
  }

  return {
    type: 'backup-alert',
    severity: 'critical',
    providerId: 'managed-mail',
    destination: channel.destination,
    incidentCode: input.incidentCode.trim(),
    message: input.message.trim(),
    timestamp: (input.now ?? (() => new Date().toISOString()))(),
  };
}
