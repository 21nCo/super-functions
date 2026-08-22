export type PlugFnOwnerKind = 'user' | 'organization' | 'delegated';

export type PlugFnConnectionOwner =
  | { kind: 'user'; userId: string; tenantId?: string }
  | { kind: 'organization'; organizationId: string; installedByUserId: string; tenantId?: string }
  | {
      kind: 'delegated';
      organizationId: string;
      delegatedToUserId: string;
      installedByUserId: string;
      grants: string[];
      tenantId?: string;
    };

export interface PlugFnActor {
  userId: string;
  tenantId?: string;
  organizationId?: string;
  roles?: string[];
  grants?: string[];
}

export interface PlugFnProviderRuntimeContext {
  provider: string;
  tenantId?: string;
  owner?: PlugFnConnectionOwner;
  actor?: PlugFnActor;
}

export interface PlugFnOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUris?: string[];
  scopes?: string[];
}

export interface PlugFnSecretResolverConfig {
  resolveOAuthClient(
    context: PlugFnProviderRuntimeContext
  ): Promise<PlugFnOAuthClientConfig | null> | PlugFnOAuthClientConfig | null;
}

export interface PlugFnProviderInstallation {
  id: string;
  provider: string;
  ownerKind: PlugFnOwnerKind;
  ownerId: string;
  tenantId?: string;
  organizationId?: string;
  installedByUserId?: string;
  delegatedToUserId?: string;
  status: 'active' | 'disabled' | 'revoked' | 'error';
  scopes?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlugFnConnectionGrant {
  id: string;
  connectionId: string;
  granteeUserId: string;
  grant: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface PlugFnWebhookReceipt {
  id: string;
  provider: string;
  event: string;
  idempotencyKey?: string;
  connectionId?: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  headersRedacted?: Record<string, string>;
  payloadHash: string;
  verificationStatus: 'verified' | 'failed' | 'not-required';
  receivedAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface PlugFnWebhookDelivery {
  id: string;
  receiptId: string;
  sinkId?: string;
  handlerName?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'dead-lettered';
  claimToken?: string;
  attempts: number;
  nextAttemptAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlugFnSyncJob {
  id: string;
  provider: string;
  connectionId: string;
  resource: string;
  mode: 'full' | 'incremental';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  claimToken?: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  cursor?: string;
  checkpoint?: unknown;
  fetchedCount: number;
  persistedCount: number;
  skippedCount: number;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlugFnSyncCheckpoint {
  id: string;
  provider: string;
  connectionId: string;
  resource: string;
  checkpoint: unknown;
  updatedAt: Date;
}

export interface PlugFnProviderEvent {
  id: string;
  provider: string;
  event: string;
  connectionId?: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PlugFnSecretRef {
  id: string;
  provider: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  keyRef: string;
  purpose: 'oauth-client' | 'webhook-secret' | 'token-key' | 'provider-api-key';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type PlugFnPersistenceSink<Raw = unknown, RecordValue = unknown> = {
  id: string;
  provider: string;
  resource: string;
  idempotencyKey(raw: Raw, context: PlugFnSinkContext): string;
  idempotencyKeyForRecord?(record: RecordValue, context: PlugFnSinkContext): string;
  transform(raw: Raw, context: PlugFnSinkContext): Promise<RecordValue> | RecordValue;
  upsert(record: RecordValue, context: PlugFnSinkContext): Promise<void>;
  delete?(raw: Raw, context: PlugFnSinkContext): Promise<void>;
};

export interface PlugFnSinkContext {
  provider: string;
  resource: string;
  connectionId?: string;
  owner?: PlugFnConnectionOwner;
  actor?: PlugFnActor;
  metadata?: Record<string, unknown>;
}
