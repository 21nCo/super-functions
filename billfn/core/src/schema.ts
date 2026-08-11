import type { TableSchema, TableSchemaMap } from '@superfunctions/db';

export interface BillFnSchemaOptions {
  namespace?: string;
}

export function getSchema(_options: BillFnSchemaOptions = {}): { version: number; schemas: TableSchema[] } {
  const billingAccounts: TableSchema = {
    modelName: 'billingAccounts',
    fields: {
      id: { type: 'string', required: true, unique: true },
      ownerType: { type: 'string', required: true },
      ownerId: { type: 'string', required: true },
      currency: { type: 'string', required: false },
      region: { type: 'string', required: false },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    }
  };

  const subscriptions: TableSchema = {
    modelName: 'subscriptions',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      planKey: { type: 'string', required: true },
      priceId: { type: 'string', required: true },
      provider: { type: 'string', required: true },
      providerSubscriptionId: { type: 'string', required: false },
      providerCheckoutId: { type: 'string', required: false },
      providerChargeId: { type: 'string', required: false },
      status: { type: 'string', required: true },
      currentPeriodStart: { type: 'string', required: false },
      currentPeriodEnd: { type: 'string', required: false },
      cancelAt: { type: 'string', required: false },
      canceledAt: { type: 'string', required: false },
      trialEnd: { type: 'string', required: false },
      autoRenew: { type: 'boolean', required: true },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'subscriptions_billing_account_updated_idx', fields: ['billingAccountId', 'updatedAt'] },
      { name: 'subscriptions_provider_subscription_idx', fields: ['provider', 'providerSubscriptionId'], unique: true },
      { name: 'subscriptions_provider_charge_idx', fields: ['provider', 'providerChargeId'], unique: true }
    ]
  };

  const checkoutSessions: TableSchema = {
    modelName: 'checkoutSessions',
    fields: {
      checkoutSessionId: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      planKey: { type: 'string', required: true },
      priceId: { type: 'string', required: true },
      provider: { type: 'string', required: true },
      providerCheckoutId: { type: 'string', required: false },
      providerSubscriptionId: { type: 'string', required: false },
      providerChargeId: { type: 'string', required: false },
      status: { type: 'string', required: true },
      checkoutUrl: { type: 'string', required: false },
      clientAction: { type: 'json', required: false },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'checkout_sessions_billing_account_idx', fields: ['billingAccountId', 'updatedAt'] },
      { name: 'checkout_sessions_provider_checkout_idx', fields: ['provider', 'providerCheckoutId'] },
      { name: 'checkout_sessions_provider_subscription_idx', fields: ['provider', 'providerSubscriptionId'] },
      { name: 'checkout_sessions_provider_charge_idx', fields: ['provider', 'providerChargeId'] }
    ]
  };

  const entitlementSnapshots: TableSchema = {
    modelName: 'entitlementSnapshots',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      planKey: { type: 'string', required: true },
      status: { type: 'string', required: true },
      features: { type: 'json', required: true },
      limits: { type: 'json', required: true },
      effectiveAt: { type: 'string', required: true },
      expiresAt: { type: 'string', required: false },
      sourceEventId: { type: 'string', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'entitlements_billing_account_idx', fields: ['billingAccountId'], unique: true }
    ]
  };

  const usageMeters: TableSchema = {
    modelName: 'usageMeters',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      resource: { type: 'string', required: true },
      current: { type: 'number', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'usage_meters_billing_account_resource_idx', fields: ['billingAccountId', 'resource'], unique: true }
    ]
  };

  const usageLedger: TableSchema = {
    modelName: 'usageLedger',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      resource: { type: 'string', required: true },
      amount: { type: 'number', required: true },
      createdAt: { type: 'string', required: true }
    }
  };

  const webhookReceipts: TableSchema = {
    modelName: 'webhookReceipts',
    fields: {
      id: { type: 'string', required: true, unique: true },
      provider: { type: 'string', required: true },
      providerEventId: { type: 'string', required: true },
      eventType: { type: 'string', required: true },
      signatureVerified: { type: 'boolean', required: true },
      rawPayload: { type: 'json', required: true },
      createdAt: { type: 'string', required: true },
      processingJobId: { type: 'string', required: false },
      processingClaimedAt: { type: 'string', required: false },
      processedAt: { type: 'string', required: false }
    },
    indexes: [
      { name: 'webhook_receipts_provider_event_idx', fields: ['provider', 'providerEventId'], unique: true }
    ]
  };

  const billingEvents: TableSchema = {
    modelName: 'billingEvents',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      type: { type: 'string', required: true },
      payload: { type: 'json', required: true },
      createdAt: { type: 'string', required: true }
    }
  };

  const refunds: TableSchema = {
    modelName: 'refunds',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      subscriptionId: { type: 'string', required: false },
      provider: { type: 'string', required: true },
      providerChargeId: { type: 'string', required: false },
      providerRefundId: { type: 'string', required: false },
      mode: { type: 'string', required: true },
      amount: { type: 'number', required: false },
      currency: { type: 'string', required: false },
      reason: { type: 'string', required: false },
      status: { type: 'string', required: true },
      operationStatus: { type: 'string', required: true },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'refunds_subscription_idx', fields: ['subscriptionId', 'updatedAt'] },
      { name: 'refunds_provider_charge_idx', fields: ['provider', 'providerChargeId'] },
      { name: 'refunds_provider_refund_idx', fields: ['provider', 'providerRefundId'], unique: true }
    ]
  };

  const subscriptionChangeRequests: TableSchema = {
    modelName: 'subscriptionChangeRequests',
    fields: {
      id: { type: 'string', required: true, unique: true },
      billingAccountId: { type: 'string', required: true },
      subscriptionId: { type: 'string', required: true },
      provider: { type: 'string', required: true },
      currentPriceId: { type: 'string', required: true },
      targetPriceId: { type: 'string', required: true },
      effectiveAt: { type: 'string', required: true },
      prorationBehavior: { type: 'string', required: true },
      status: { type: 'string', required: true },
      operationStatus: { type: 'string', required: true },
      clientAction: { type: 'json', required: false },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true }
    },
    indexes: [
      { name: 'subscription_change_requests_subscription_idx', fields: ['subscriptionId', 'updatedAt'] }
    ]
  };

  const reconciliationJobs: TableSchema = {
    modelName: 'reconciliationJobs',
    fields: {
      id: { type: 'string', required: true, unique: true },
      kind: { type: 'string', required: true },
      status: { type: 'string', required: true },
      provider: { type: 'string', required: false },
      billingAccountId: { type: 'string', required: false },
      subscriptionId: { type: 'string', required: false },
      providerEventId: { type: 'string', required: false },
      cursor: { type: 'string', required: false },
      attempts: { type: 'number', required: true },
      error: { type: 'string', required: false },
      payload: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true },
      completedAt: { type: 'string', required: false }
    },
    indexes: [
      { name: 'reconciliation_jobs_kind_status_idx', fields: ['kind', 'status', 'updatedAt'] },
      { name: 'reconciliation_jobs_subscription_idx', fields: ['subscriptionId', 'updatedAt'] },
      { name: 'reconciliation_jobs_account_idx', fields: ['billingAccountId', 'updatedAt'] }
    ]
  };

  const reconciliationCursors: TableSchema = {
    modelName: 'reconciliationCursors',
    fields: {
      id: { type: 'string', required: true, unique: true },
      provider: { type: 'string', required: true },
      cursorKey: { type: 'string', required: true },
      cursor: { type: 'string', required: false },
      updatedAt: { type: 'string', required: true },
      metadata: { type: 'json', required: false }
    },
    indexes: [
      { name: 'reconciliation_cursors_provider_key_idx', fields: ['provider', 'cursorKey'], unique: true }
    ]
  };

  const schemas = [
    billingAccounts,
    subscriptions,
    checkoutSessions,
    entitlementSnapshots,
    usageMeters,
    usageLedger,
    webhookReceipts,
    billingEvents,
    refunds,
    subscriptionChangeRequests,
    reconciliationJobs,
    reconciliationCursors
  ];

  return {
    version: 3,
    schemas
  };
}

export function getSchemaMap(options: BillFnSchemaOptions = {}): TableSchemaMap {
  const { schemas } = getSchema(options);
  return Object.fromEntries(schemas.map((schema) => [schema.modelName, schema]));
}
