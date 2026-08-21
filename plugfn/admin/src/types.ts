import type {
  ConnectionStatus,
  PlugFn,
  PlugFnOwnerKind,
  PlugFnSyncJob,
  WorkflowStatus,
} from "plugfn";
import type { AdminOperationContext } from "@superfunctions/admin";

export type PlugFnAdminJson<T> =
  T extends Date ? string
    : T extends readonly (infer TItem)[] ? PlugFnAdminJson<TItem>[]
      : T extends object ? { [TKey in keyof T]: PlugFnAdminJson<T[TKey]> }
        : T;

export interface PlugFnPageInput {
  cursor?: string;
  limit?: number;
}

export interface PlugFnProviderListInput extends PlugFnPageInput { search?: string }
export interface PlugFnProviderGetInput { id: string }
export interface PlugFnProviderView {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  iconUrl?: string;
  authType: string;
  configured: boolean;
  actions: string[];
  triggers: string[];
  webhookEvents: string[];
  syncResources: string[];
  capabilities: Record<string, boolean>;
}

export interface PlugFnConnectionListInput extends PlugFnPageInput {
  provider?: string;
  status?: ConnectionStatus;
}
export interface PlugFnConnectionGetInput { id: string }
export interface PlugFnAuthorizeConnectionInput {
  provider: string;
  redirectUri: string;
  scopes?: string[];
  connectionName?: string;
  returnTo?: string;
  prompt?: string;
  loginHint?: string;
}
export interface PlugFnConnectionTargetInput { id: string }
export interface PlugFnConnectionView {
  id: string;
  provider: string;
  ownerKind?: PlugFnOwnerKind;
  ownerId?: string;
  name?: string;
  status: ConnectionStatus;
  scopes?: string[];
  expiresAt?: string;
  connectedAt: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  hasCredentials: boolean;
}

export interface PlugFnInstallationListInput extends PlugFnPageInput {
  provider?: string;
  status?: "active" | "disabled" | "revoked" | "error";
}
export interface PlugFnInstallationTargetInput { id: string }
export interface PlugFnInstallationView {
  id: string;
  provider: string;
  ownerKind: PlugFnOwnerKind;
  ownerId: string;
  status: "active" | "disabled" | "revoked" | "error";
  scopes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlugFnWorkflowListInput extends PlugFnPageInput {
  status?: WorkflowStatus;
  provider?: string;
}
export interface PlugFnWorkflowTargetInput { id: string }
export interface PlugFnWorkflowView {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  trigger: { provider: string; event: string };
  steps: Array<{ id: string; type: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface PlugFnWebhookReceiptGetInput { id: string }
export interface PlugFnWebhookDeliveryListInput extends PlugFnPageInput { receiptId: string }

export interface PlugFnSyncJobListInput extends PlugFnPageInput {
  provider?: string;
  connectionId?: string;
  resource?: string;
  status?: PlugFnSyncJob["status"];
}
export interface PlugFnSyncJobGetInput { id: string }
export interface PlugFnRunSyncInput {
  provider: string;
  connectionId: string;
  resource: string;
  mode: PlugFnSyncJob["mode"];
  sinkId?: string;
  maxPages?: number;
}
export interface PlugFnCancelSyncInput { id: string }

export interface PlugFnListOutput<T> { items: T[]; nextCursor: string | null }
export interface PlugFnItemOutput<T> { item: T }
export interface PlugFnAcceptedOutput<T = never> {
  accepted: true;
  item?: T;
}
export interface PlugFnAuthorizeConnectionOutput { accepted: true; authUrl: string }
export interface PlugFnDisconnectOutput {
  accepted: true;
  disconnected: boolean;
  remoteRevokeAttempted: boolean;
  remoteRevokeSucceeded: boolean;
  localDeleted: boolean;
}

export interface PlugFnAdminService {
  listProviders(input: PlugFnProviderListInput, context: AdminOperationContext): Promise<PlugFnListOutput<PlugFnProviderView>>;
  getProvider(input: PlugFnProviderGetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<PlugFnProviderView>>;
  listConnections(input: PlugFnConnectionListInput, context: AdminOperationContext): Promise<PlugFnListOutput<PlugFnConnectionView>>;
  getConnection(input: PlugFnConnectionGetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<PlugFnConnectionView>>;
  authorizeConnection(input: PlugFnAuthorizeConnectionInput, context: AdminOperationContext): Promise<PlugFnAuthorizeConnectionOutput>;
  refreshConnection(input: PlugFnConnectionTargetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<PlugFnConnectionView>>;
  disconnectConnection(input: PlugFnConnectionTargetInput, context: AdminOperationContext): Promise<PlugFnDisconnectOutput>;
  listInstallations(input: PlugFnInstallationListInput, context: AdminOperationContext): Promise<PlugFnListOutput<PlugFnInstallationView>>;
  getInstallation(input: PlugFnInstallationTargetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<PlugFnInstallationView>>;
  disableInstallation(input: PlugFnInstallationTargetInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput<PlugFnInstallationView>>;
  revokeInstallation(input: PlugFnInstallationTargetInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput<PlugFnInstallationView>>;
  listWorkflows(input: PlugFnWorkflowListInput, context: AdminOperationContext): Promise<PlugFnListOutput<PlugFnWorkflowView>>;
  getWorkflow(input: PlugFnWorkflowTargetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<PlugFnWorkflowView>>;
  getWorkflowStats(input: PlugFnWorkflowTargetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<Record<string, unknown>>>;
  enableWorkflow(input: PlugFnWorkflowTargetInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput>;
  disableWorkflow(input: PlugFnWorkflowTargetInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput>;
  deleteWorkflow(input: PlugFnWorkflowTargetInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput>;
  getWebhookReceipt(input: PlugFnWebhookReceiptGetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<Record<string, unknown>>>;
  listWebhookDeliveries(input: PlugFnWebhookDeliveryListInput, context: AdminOperationContext): Promise<PlugFnListOutput<Record<string, unknown>>>;
  listSyncJobs(input: PlugFnSyncJobListInput, context: AdminOperationContext): Promise<PlugFnListOutput<Record<string, unknown>>>;
  getSyncJob(input: PlugFnSyncJobGetInput, context: AdminOperationContext): Promise<PlugFnItemOutput<Record<string, unknown>>>;
  runSync(input: PlugFnRunSyncInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput<Record<string, unknown>>>;
  enqueueSync(input: PlugFnRunSyncInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput<Record<string, unknown>>>;
  cancelSync(input: PlugFnCancelSyncInput, context: AdminOperationContext): Promise<PlugFnAcceptedOutput<Record<string, unknown>>>;
}

export interface PlugFnDomainIdentity {
  userId: string;
  tenantId?: string;
  organizationId?: string;
}

export interface PlugFnDomainAdminServiceOptions {
  /** Public PlugFn facade already configured for this self-hosted project. */
  plugfn: PlugFn;
  /** Project that owns the PlugFn facade and persistence boundary. */
  projectId: string;
  /** Maps the authenticated admin actor/scope into PlugFn's ownership model. */
  identity(context: AdminOperationContext): PlugFnDomainIdentity | Promise<PlugFnDomainIdentity>;
}
