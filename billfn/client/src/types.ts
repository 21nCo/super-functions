import type {
  BillFnCancelSubscriptionResponse,
  BillFnChangeSubscriptionResponse,
  BillFnCreateCheckoutResponse,
  BillFnEntitlementsResponse,
  BillFnReconciliationJobResponse,
  BillFnRefundChargeResponse,
  BillFnRestorePurchasesResponse,
  BillFnResumeSubscriptionResponse,
  BillFnSyncSubscriptionResponse,
  BillFnUsageResponse,
  BillFnVerifyCheckoutResponse
} from '@billfn/core';
import type { Envelope } from '@superfunctions/envelope';

export interface BillFnClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}

export type BillFnClientErrorEnvelope = Extract<Envelope<never>, { ok: false }>;

export interface BillFnClient {
  getCatalog(): Promise<Envelope<import('@billfn/core').BillFnCatalog>>;
  getEntitlements(query?: Record<string, string>): Promise<BillFnEntitlementsResponse | BillFnClientErrorEnvelope>;
  getUsage(query?: Record<string, string>): Promise<BillFnUsageResponse | BillFnClientErrorEnvelope>;
  createCheckout(input: {
    subject?: import('@billfn/core').BillableSubject;
    planKey: string;
    provider: import('@billfn/core').BillingProviderName;
    interval?: import('@billfn/core').BillingInterval;
    metadata?: Record<string, unknown>;
    customer?: {
      email?: string;
      name?: string;
      billing?: Record<string, unknown>;
    };
    returnUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<BillFnCreateCheckoutResponse | BillFnClientErrorEnvelope>;
  verifyCheckout(input: {
    subject?: import('@billfn/core').BillableSubject;
    checkoutSessionId: string;
    payload?: Record<string, unknown>;
  }): Promise<BillFnVerifyCheckoutResponse | BillFnClientErrorEnvelope>;
  cancelSubscription(input: {
    subject?: import('@billfn/core').BillableSubject;
    subscriptionId?: string;
    reason?: string;
  }): Promise<BillFnCancelSubscriptionResponse | BillFnClientErrorEnvelope>;
  changeSubscription(input: {
    subject?: import('@billfn/core').BillableSubject;
    subscriptionId?: string;
    targetPriceId: string;
    effectiveAt?: import('@billfn/core').BillFnChangeEffectiveAt;
    prorationBehavior?: import('@billfn/core').BillFnProrationBehavior;
    reason?: string;
  }): Promise<BillFnChangeSubscriptionResponse | BillFnClientErrorEnvelope>;
  resumeSubscription(input: {
    subject?: import('@billfn/core').BillableSubject;
    subscriptionId?: string;
  }): Promise<BillFnResumeSubscriptionResponse | BillFnClientErrorEnvelope>;
  refundCharge(input: {
    subject?: import('@billfn/core').BillableSubject;
    subscriptionId?: string;
    providerChargeId?: string;
    mode?: import('@billfn/core').BillFnRefundMode;
    amount?: number;
    reason?: string;
  }): Promise<BillFnRefundChargeResponse | BillFnClientErrorEnvelope>;
  syncSubscription(input: {
    subject?: import('@billfn/core').BillableSubject;
    subscriptionId?: string;
  }): Promise<BillFnSyncSubscriptionResponse | BillFnClientErrorEnvelope>;
  restorePurchases(input: {
    subject?: import('@billfn/core').BillableSubject;
    planKey: string;
    provider: import('@billfn/core').BillingProviderName;
    priceId?: string;
    purchaseReference: string;
    payload?: Record<string, unknown>;
  }): Promise<BillFnRestorePurchasesResponse | BillFnClientErrorEnvelope>;
  enqueueReconciliationJob(input: {
    kind: import('@billfn/core').BillFnReconciliationJobKind;
    provider?: import('@billfn/core').BillingProviderName;
    billingAccountId?: string;
    subscriptionId?: string;
    providerEventId?: string;
    cursor?: string;
    payload?: Record<string, unknown>;
  }): Promise<BillFnReconciliationJobResponse | BillFnClientErrorEnvelope>;
  getReconciliationJob(jobId: string): Promise<BillFnReconciliationJobResponse | BillFnClientErrorEnvelope>;
  runReconciliationJob(jobId: string): Promise<BillFnReconciliationJobResponse | BillFnClientErrorEnvelope>;
}
