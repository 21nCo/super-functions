import type { Adapter, TableSchema } from '@superfunctions/db';
import type { Envelope } from '@superfunctions/envelope';
import type { Router } from '@superfunctions/http';
import type { MetricsEmitter } from '@superfunctions/metrics';
import type { QueueAdapter } from '@superfunctions/queue';

export type BillingProviderName =
  | 'dodo'
  | 'apple'
  | 'stripe'
  | 'polar'
  | 'google-play'
  | 'microsoft-store';

export type BillingOwnerType = 'user' | 'organization';
export type BillingActorType = 'user' | 'api-key' | 'service';
export type BillingPriceKind = 'subscription' | 'one_time';
export type BillingInterval = 'month' | 'year' | 'lifetime';

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'grace'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'paused'
  | 'failed';

export type EntitlementStatus = 'trialing' | 'active' | 'grace' | 'inactive';
export type CheckoutSessionStatus =
  | 'pending'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'expired';

export type BillFnOperationStatus = 'applied' | 'requires_action';
export type BillFnChangeEffectiveAt = 'immediate' | 'next_renewal';
export type BillFnProrationBehavior = 'provider_default' | 'prorate' | 'none';
export type BillFnRefundMode = 'full' | 'prorated_remaining_period' | 'custom';
export type BillFnReconciliationJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type BillFnReconciliationJobKind =
  | 'webhook-event'
  | 'subscription-sync'
  | 'account-scan'
  | 'notification-history-backfill'
  | 'webhook-replay';

export interface BillableSubject {
  actorId?: string;
  actorType?: BillingActorType;
  principalId?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface BillingAccountResolver {
  resolve(input: BillableSubject): Promise<{
    billingAccountId: string;
    ownerType: BillingOwnerType;
    ownerId: string;
  } | null>;
}

export interface BillFnPlanDefinition {
  productKey: string;
  planKey: string;
  displayName: string;
  description?: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  metadata?: Record<string, unknown>;
  prices: BillFnPriceDefinition[];
}

export interface BillFnPriceDefinition {
  priceId: string;
  provider: BillingProviderName;
  providerProductId: string;
  displayName?: string;
  currency: string;
  amount: number;
  kind: BillingPriceKind;
  interval: BillingInterval;
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

export interface BillFnCatalog {
  plans: BillFnPlanDefinition[];
}

export interface BillFnBillingAccount {
  id: string;
  ownerType: BillingOwnerType;
  ownerId: string;
  currency?: string;
  region?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnSubscription {
  id: string;
  billingAccountId: string;
  planKey: string;
  priceId: string;
  provider: BillingProviderName;
  providerSubscriptionId?: string;
  providerCheckoutId?: string;
  providerChargeId?: string;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAt?: string;
  canceledAt?: string;
  trialEnd?: string;
  autoRenew: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnCheckoutSession {
  checkoutSessionId: string;
  billingAccountId: string;
  planKey: string;
  priceId: string;
  provider: BillingProviderName;
  providerCheckoutId?: string;
  providerSubscriptionId?: string;
  providerChargeId?: string;
  status: CheckoutSessionStatus;
  checkoutUrl?: string;
  clientAction?: BillFnClientAction;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnEntitlementSnapshot {
  id: string;
  billingAccountId: string;
  planKey: string;
  status: EntitlementStatus;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  effectiveAt: string;
  expiresAt?: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnUsageMeter {
  id: string;
  billingAccountId: string;
  resource: string;
  current: number;
  updatedAt: string;
}

export interface BillFnUsageLedgerEntry {
  id: string;
  billingAccountId: string;
  resource: string;
  amount: number;
  createdAt: string;
}

export interface BillFnWebhookReceipt {
  id: string;
  provider: BillingProviderName;
  providerEventId: string;
  eventType: string;
  signatureVerified: boolean;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  processingJobId?: string | null;
  processedAt?: string | null;
}

export interface BillFnBillingEvent {
  id: string;
  billingAccountId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface BillFnRefund {
  id: string;
  billingAccountId: string;
  subscriptionId?: string;
  provider: BillingProviderName;
  providerChargeId?: string;
  providerRefundId?: string;
  mode: BillFnRefundMode;
  amount?: number;
  currency?: string;
  reason?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  operationStatus: BillFnOperationStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnSubscriptionChangeRequest {
  id: string;
  billingAccountId: string;
  subscriptionId: string;
  provider: BillingProviderName;
  currentPriceId: string;
  targetPriceId: string;
  effectiveAt: BillFnChangeEffectiveAt;
  prorationBehavior: BillFnProrationBehavior;
  status: 'pending' | 'applied' | 'requires_action' | 'failed';
  operationStatus: BillFnOperationStatus;
  clientAction?: BillFnClientAction;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillFnReconciliationJob {
  id: string;
  kind: BillFnReconciliationJobKind;
  status: BillFnReconciliationJobStatus;
  provider?: BillingProviderName;
  billingAccountId?: string;
  subscriptionId?: string;
  providerEventId?: string;
  cursor?: string;
  attempts: number;
  error?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BillFnReconciliationCursor {
  id: string;
  provider: BillingProviderName;
  cursorKey: string;
  cursor?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface BillFnClientAction {
  type: 'redirect' | 'apple-purchase' | 'manage-subscription';
  url?: string;
  productId?: string;
  metadata?: Record<string, unknown>;
}

export interface BillFnProviderCapabilities {
  createCheckout: boolean;
  verifyCheckout: boolean;
  cancelSubscription: boolean;
  syncSubscription: boolean;
  restorePurchases: boolean;
  webhookIngestion: boolean;
  changeSubscription?: boolean;
  resumeSubscription?: boolean;
  refundCharge?: boolean;
  notificationHistory?: boolean;
}

export interface BillFnProviderCheckoutResult {
  status: CheckoutSessionStatus;
  providerCheckoutId?: string;
  providerSubscriptionId?: string;
  providerChargeId?: string;
  checkoutUrl?: string;
  clientAction?: BillFnClientAction;
  raw?: Record<string, unknown>;
}

export interface BillFnVerifiedBillingState {
  subscriptionStatus: SubscriptionStatus;
  checkoutStatus: CheckoutSessionStatus;
  providerSubscriptionId?: string;
  providerChargeId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  autoRenew?: boolean;
  raw?: Record<string, unknown>;
}

export interface BillFnProviderOperationResult {
  operationStatus: BillFnOperationStatus;
  billingState?: BillFnVerifiedBillingState | null;
  clientAction?: BillFnClientAction;
  providerRefundId?: string;
  raw?: Record<string, unknown>;
}

export interface BillFnParsedWebhookEvent {
  providerEventId: string;
  type: string;
  signatureVerified: boolean;
  occurredAt?: string;
  planKey?: string;
  priceId?: string;
  providerSubscriptionId?: string;
  providerChargeId?: string;
  checkoutReferenceId?: string;
  billingState?: BillFnVerifiedBillingState;
  raw: Record<string, unknown>;
}

export interface BillFnNotificationHistoryPage {
  events: BillFnParsedWebhookEvent[];
  nextCursor?: string;
}

export interface BillFnCreateCheckoutInput {
  checkoutSessionId: string;
  billingAccount: BillFnBillingAccount;
  plan: BillFnPlanDefinition;
  price: BillFnPriceDefinition;
  metadata?: Record<string, unknown>;
  customer?: {
    email?: string;
    name?: string;
    billing?: Record<string, unknown>;
  };
  returnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface BillFnVerifyCheckoutInput {
  checkoutSession: BillFnCheckoutSession;
  billingAccount: BillFnBillingAccount;
  plan: BillFnPlanDefinition;
  price: BillFnPriceDefinition;
  payload?: Record<string, unknown>;
}

export interface BillFnSyncSubscriptionInput {
  subscription: BillFnSubscription;
  plan: BillFnPlanDefinition;
  price: BillFnPriceDefinition;
}

export interface BillFnCancelSubscriptionInput {
  subscription: BillFnSubscription;
  reason?: string;
}

export interface BillFnChangeSubscriptionInput {
  subscription: BillFnSubscription;
  currentPlan: BillFnPlanDefinition;
  currentPrice: BillFnPriceDefinition;
  targetPlan: BillFnPlanDefinition;
  targetPrice: BillFnPriceDefinition;
  effectiveAt: BillFnChangeEffectiveAt;
  prorationBehavior: BillFnProrationBehavior;
  reason?: string;
}

export interface BillFnResumeSubscriptionInput {
  subscription: BillFnSubscription;
}

export interface BillFnRefundChargeInput {
  subscription?: BillFnSubscription;
  billingAccount: BillFnBillingAccount;
  providerChargeId?: string;
  mode: BillFnRefundMode;
  amount?: number;
  reason?: string;
}

export interface BillFnRestorePurchasesInput {
  billingAccount: BillFnBillingAccount;
  plan: BillFnPlanDefinition;
  price: BillFnPriceDefinition;
  purchaseReference: string;
  payload?: Record<string, unknown>;
}

export interface BillFnParseWebhookInput {
  headers: Headers;
  rawBody: string;
}

export interface BillFnFetchNotificationHistoryInput {
  cursor?: string;
  limit?: number;
}

export interface BillFnProviderAdapter {
  readonly provider: BillingProviderName;
  readonly capabilities: BillFnProviderCapabilities;
  createCheckout?(input: BillFnCreateCheckoutInput): Promise<BillFnProviderCheckoutResult>;
  verifyCheckout?(input: BillFnVerifyCheckoutInput): Promise<BillFnVerifiedBillingState>;
  fetchSubscription?(input: BillFnSyncSubscriptionInput): Promise<BillFnVerifiedBillingState | null>;
  cancelSubscription?(input: BillFnCancelSubscriptionInput): Promise<BillFnProviderOperationResult | null>;
  changeSubscription?(input: BillFnChangeSubscriptionInput): Promise<BillFnProviderOperationResult>;
  resumeSubscription?(input: BillFnResumeSubscriptionInput): Promise<BillFnProviderOperationResult>;
  refundCharge?(input: BillFnRefundChargeInput): Promise<BillFnProviderOperationResult>;
  restorePurchases?(input: BillFnRestorePurchasesInput): Promise<BillFnVerifiedBillingState[]>;
  parseWebhook?(input: BillFnParseWebhookInput): Promise<BillFnParsedWebhookEvent[]>;
  fetchNotificationHistory?(input: BillFnFetchNotificationHistoryInput): Promise<BillFnNotificationHistoryPage>;
}

export interface BillFnWebhookQueuedJob {
  type: 'webhook-event';
  jobId?: string;
  provider: BillingProviderName;
  providerEventId: string;
}

export interface BillFnSubscriptionSyncQueuedJob {
  type: 'subscription-sync';
  jobId?: string;
  provider: BillingProviderName;
  subscriptionId: string;
}

export interface BillFnAccountScanQueuedJob {
  type: 'account-scan';
  jobId?: string;
  provider?: BillingProviderName;
  billingAccountId: string;
}

export interface BillFnNotificationHistoryQueuedJob {
  type: 'notification-history-backfill';
  jobId?: string;
  provider: BillingProviderName;
  cursor?: string;
}

export interface BillFnWebhookReplayQueuedJob {
  type: 'webhook-replay';
  jobId?: string;
  provider: BillingProviderName;
  providerEventId: string;
}

export type BillFnQueuedJob =
  | BillFnWebhookQueuedJob
  | BillFnSubscriptionSyncQueuedJob
  | BillFnAccountScanQueuedJob
  | BillFnNotificationHistoryQueuedJob
  | BillFnWebhookReplayQueuedJob;

export interface BillFnConfig {
  db: Adapter;
  catalog: BillFnCatalog;
  namespace?: string;
  basePath?: string;
  providers?: Partial<Record<BillingProviderName, BillFnProviderAdapter>>;
  billingAccountResolver?: BillingAccountResolver;
  metrics?: MetricsEmitter;
  queue?: QueueAdapter<BillFnQueuedJob>;
  auth?: {
    resolveSubject?: (request: Request) => Promise<BillableSubject | null> | BillableSubject | null;
  };
  operations?: {
    authorize?: (request: Request) => Promise<boolean> | boolean;
  };
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

export interface BillFnCheckoutCreateRequest {
  subject?: BillableSubject;
  planKey: string;
  provider: BillingProviderName;
  interval?: BillingInterval;
  metadata?: Record<string, unknown>;
  customer?: {
    email?: string;
    name?: string;
    billing?: Record<string, unknown>;
  };
  returnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface BillFnCheckoutVerifyRequest {
  subject?: BillableSubject;
  checkoutSessionId: string;
  payload?: Record<string, unknown>;
}

export type BillFnVerifyCheckoutRequest = BillFnCheckoutVerifyRequest;

export interface BillFnCancelSubscriptionRequest {
  subject?: BillableSubject;
  subscriptionId?: string;
  reason?: string;
}

export interface BillFnChangeSubscriptionRequest {
  subject?: BillableSubject;
  subscriptionId?: string;
  targetPriceId: string;
  effectiveAt?: BillFnChangeEffectiveAt;
  prorationBehavior?: BillFnProrationBehavior;
  reason?: string;
}

export interface BillFnResumeSubscriptionRequest {
  subject?: BillableSubject;
  subscriptionId?: string;
}

export interface BillFnRefundChargeRequest {
  subject?: BillableSubject;
  subscriptionId?: string;
  providerChargeId?: string;
  mode?: BillFnRefundMode;
  amount?: number;
  reason?: string;
}

export interface BillFnRestorePurchasesRequest {
  subject?: BillableSubject;
  planKey: string;
  provider: BillingProviderName;
  priceId?: string;
  purchaseReference: string;
  payload?: Record<string, unknown>;
}

export interface BillFnSyncSubscriptionRequest {
  subject?: BillableSubject;
  subscriptionId?: string;
}

export interface BillFnWebhookRequest {
  provider: BillingProviderName;
  rawBody: string;
  headers: Headers;
}

export interface BillFnEnqueueReconciliationJobRequest {
  kind: BillFnReconciliationJobKind;
  provider?: BillingProviderName;
  billingAccountId?: string;
  subscriptionId?: string;
  providerEventId?: string;
  cursor?: string;
  payload?: Record<string, unknown>;
}

export interface BillFnRunReconciliationJobRequest {
  jobId: string;
}

export interface BillFnGetReconciliationJobRequest {
  jobId: string;
}

export interface BillFnStatus {
  ok: true;
  version: number;
  namespace: string;
  providers: BillingProviderName[];
  capabilities: string[];
}

export interface BillFnSubscriptionOperationResponseData {
  subscription: BillFnSubscription;
  entitlements: BillFnEntitlementSnapshot;
  operationStatus: BillFnOperationStatus;
  clientAction?: BillFnClientAction;
}

export interface BillFnRefundChargeResponseData {
  refund: BillFnRefund;
  subscription: BillFnSubscription | null;
  entitlements: BillFnEntitlementSnapshot | null;
  operationStatus: BillFnOperationStatus;
  clientAction?: BillFnClientAction;
}

export interface BillFnReconciliationJobResponseData {
  job: BillFnReconciliationJob;
}

export interface BillFnCreateCheckoutResponseData {
  checkoutSession: BillFnCheckoutSession;
  billingAccount: BillFnBillingAccount;
  plan: Pick<BillFnPlanDefinition, 'planKey' | 'productKey' | 'displayName'>;
}

export interface BillFnVerifyCheckoutResponseData {
  checkoutSession: BillFnCheckoutSession;
  subscription: BillFnSubscription;
  entitlements: BillFnEntitlementSnapshot;
}

export interface BillFnCancelSubscriptionResponseData extends BillFnSubscriptionOperationResponseData {}

export interface BillFnChangeSubscriptionResponseData extends BillFnSubscriptionOperationResponseData {
  changeRequest: BillFnSubscriptionChangeRequest;
}

export interface BillFnResumeSubscriptionResponseData extends BillFnSubscriptionOperationResponseData {}

export interface BillFnSyncSubscriptionResponseData {
  subscription: BillFnSubscription;
  entitlements: BillFnEntitlementSnapshot;
}

export interface BillFnRestorePurchasesResponseData {
  subscription: BillFnSubscription;
  entitlements: BillFnEntitlementSnapshot;
}

export interface BillFnEntitlementsResponseData {
  billingAccount: BillFnBillingAccount;
  entitlements: BillFnEntitlementSnapshot | null;
  subscription: BillFnSubscription | null;
}

export interface BillFnUsageResponseData {
  billingAccount: BillFnBillingAccount;
  usage: Array<{
    resource: string;
    current: number;
    limit: number;
  }>;
}

export interface BillFnWebhookResponseData {
  accepted: boolean;
  processed: number;
}

export type BillFnEnvelope<T> = Envelope<T>;

export type BillFnCreateCheckoutResponse = BillFnEnvelope<BillFnCreateCheckoutResponseData>;
export type BillFnVerifyCheckoutResponse = BillFnEnvelope<BillFnVerifyCheckoutResponseData>;
export type BillFnCancelSubscriptionResponse = BillFnEnvelope<BillFnCancelSubscriptionResponseData>;
export type BillFnChangeSubscriptionResponse = BillFnEnvelope<BillFnChangeSubscriptionResponseData>;
export type BillFnResumeSubscriptionResponse = BillFnEnvelope<BillFnResumeSubscriptionResponseData>;
export type BillFnRefundChargeResponse = BillFnEnvelope<BillFnRefundChargeResponseData>;
export type BillFnSyncSubscriptionResponse = BillFnEnvelope<BillFnSyncSubscriptionResponseData>;
export type BillFnRestorePurchasesResponse = BillFnEnvelope<BillFnRestorePurchasesResponseData>;
export type BillFnEntitlementsResponse = BillFnEnvelope<BillFnEntitlementsResponseData>;
export type BillFnUsageResponse = BillFnEnvelope<BillFnUsageResponseData>;
export type BillFnWebhookResponse = BillFnEnvelope<BillFnWebhookResponseData>;
export type BillFnReconciliationJobResponse = BillFnEnvelope<BillFnReconciliationJobResponseData>;

export interface BillFnInstance {
  router: Router;
  getSchema(): { version: number; schemas: TableSchema[] };
  getCatalog(): Promise<BillFnCatalog>;
  createCheckout(input: BillFnCheckoutCreateRequest): Promise<BillFnCreateCheckoutResponse>;
  verifyCheckout(input: BillFnCheckoutVerifyRequest): Promise<BillFnVerifyCheckoutResponse>;
  cancelSubscription(input: BillFnCancelSubscriptionRequest): Promise<BillFnCancelSubscriptionResponse>;
  changeSubscription(input: BillFnChangeSubscriptionRequest): Promise<BillFnChangeSubscriptionResponse>;
  resumeSubscription(input: BillFnResumeSubscriptionRequest): Promise<BillFnResumeSubscriptionResponse>;
  refundCharge(input: BillFnRefundChargeRequest): Promise<BillFnRefundChargeResponse>;
  syncSubscription(input: BillFnSyncSubscriptionRequest): Promise<BillFnSyncSubscriptionResponse>;
  restorePurchases(input: BillFnRestorePurchasesRequest): Promise<BillFnRestorePurchasesResponse>;
  getEntitlements(subject: BillableSubject): Promise<BillFnEntitlementsResponse>;
  getUsage(subject: BillableSubject, resource?: string): Promise<BillFnUsageResponse>;
  handleWebhook(input: BillFnWebhookRequest): Promise<BillFnWebhookResponse>;
  enqueueReconciliationJob(input: BillFnEnqueueReconciliationJobRequest): Promise<BillFnReconciliationJobResponse>;
  getReconciliationJob(input: BillFnGetReconciliationJobRequest): Promise<BillFnReconciliationJobResponse>;
  runReconciliationJob(input: BillFnRunReconciliationJobRequest): Promise<BillFnReconciliationJobResponse>;
  subscriptionProvider: {
    getActiveSubscription(subject: BillableSubject): Promise<BillFnSubscription | null>;
    getEntitlementSnapshot(subject: BillableSubject): Promise<BillFnEntitlementSnapshot | null>;
    isActive(subject: BillableSubject): Promise<boolean>;
    hasFeature(subject: BillableSubject, feature: string): Promise<boolean>;
  };
  quotaProvider: {
    checkQuota(input: {
      principalId?: string;
      tenantId?: string;
      requestedBytes: number;
      resource?: string;
    }): Promise<{
      allowed: boolean;
      current: number;
      limit: number;
      warning?: string;
      reason?: string;
    }>;
    recordUsage(input: {
      principalId?: string;
      tenantId?: string;
      bytes: number;
      resource?: string;
    }): Promise<void>;
    getUsage(principalId?: string, tenantId?: string, resource?: string): Promise<{ current: number; limit: number }>;
  };
}
