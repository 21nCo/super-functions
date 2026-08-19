import type { PlugFnConnectionOwner, PlugFnOwnerKind } from 'plugfn';
export type { PlugFnApiEnvelope, PlugFnApiError, PlugFnConnectionOwner, PlugFnOwnerKind } from 'plugfn';

export interface PlugFnProviderSummary {
  name: string;
  displayName: string;
  description?: string;
  authType: string;
}

export interface PlugFnConnectionSummary {
  id: string;
  userId: string;
  provider: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  name?: string;
  status: 'active' | 'expired' | 'revoked' | 'error';
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: string | Date;
  connectedAt: string | Date;
  lastUsedAt?: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PlugFnStartConnectionInput {
  provider: string;
  redirectUri?: string;
  scopes?: string[];
  connectionName?: string;
  owner?: PlugFnConnectionOwner;
  returnTo?: string;
  /** OAuth prompt (e.g. `select_account` for Google). Ignored by providers that do not support it. */
  prompt?: string;
  /** OAuth login_hint (e.g. email prefill). */
  loginHint?: string;
  redirect?: 'none' | 'current-window' | 'new-window';
}

export interface PlugFnDisconnectInput {
  provider: string;
  connectionId?: string;
}

export interface PlugFnSyncJob {
  id: string;
  provider: string;
  connectionId: string;
  resource: string;
  mode: 'full' | 'incremental';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  cursor?: string;
  checkpoint?: unknown;
  fetchedCount: number;
  persistedCount: number;
  skippedCount: number;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PlugFnCreateSyncJobInput {
  provider: string;
  connectionId: string;
  resource: string;
  mode?: 'full' | 'incremental';
  owner?: PlugFnConnectionOwner;
  cursor?: string;
  checkpoint?: unknown;
  metadata?: Record<string, unknown>;
}

export interface PlugFnUpsertCheckpointInput {
  provider: string;
  connectionId: string;
  resource: string;
  checkpoint: unknown;
}

export interface PlugFnCheckpoint {
  id: string;
  provider: string;
  connectionId: string;
  resource: string;
  checkpoint: unknown;
  updatedAt: string | Date;
}
