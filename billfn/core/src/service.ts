import { AdapterErrorCode, DuplicateKeyError, NotFoundError, type Adapter, type WhereClause } from '@superfunctions/db';
import { ok } from '@superfunctions/envelope';
import { createNamespacedEmitter, createMetricsEmitter, type MetricsEmitter } from '@superfunctions/metrics';
import type { QueueAdapter } from '@superfunctions/queue';
import { createBillFnError } from './errors.js';
import {
  createDefaultBillingAccountResolver,
  defaultIdFactory,
  resolvePlan,
  resolvePrice,
  toIsoString
} from './helpers.js';
import type {
  BillFnBillingAccount,
  BillFnBillingEvent,
  BillFnCancelSubscriptionRequest,
  BillFnCancelSubscriptionResponse,
  BillFnCatalog,
  BillFnChangeSubscriptionRequest,
  BillFnChangeSubscriptionResponse,
  BillFnCheckoutCreateRequest,
  BillFnCheckoutSession,
  BillFnConfig,
  BillFnCreateCheckoutResponse,
  BillFnCreateCheckoutResponseData,
  BillFnEnqueueReconciliationJobRequest,
  BillFnEntitlementSnapshot,
  BillFnEntitlementsResponse,
  BillFnEntitlementsResponseData,
  BillFnFetchNotificationHistoryInput,
  BillFnGetReconciliationJobRequest,
  BillFnPriceDefinition,
  BillFnProviderAdapter,
  BillFnQueuedJob,
  BillFnReconciliationCursor,
  BillFnReconciliationJob,
  BillFnReconciliationJobKind,
  BillFnReconciliationJobResponse,
  BillFnRefund,
  BillFnRefundChargeRequest,
  BillFnRefundChargeResponse,
  BillFnRestorePurchasesRequest,
  BillFnRestorePurchasesResponse,
  BillFnRestorePurchasesResponseData,
  BillFnResumeSubscriptionRequest,
  BillFnResumeSubscriptionResponse,
  BillFnRunReconciliationJobRequest,
  BillFnSubscription,
  BillFnSubscriptionChangeRequest,
  BillFnSyncSubscriptionRequest,
  BillFnSyncSubscriptionResponse,
  BillFnSyncSubscriptionResponseData,
  BillFnUsageLedgerEntry,
  BillFnUsageMeter,
  BillFnUsageResponse,
  BillFnUsageResponseData,
  BillFnVerifyCheckoutRequest,
  BillFnVerifyCheckoutResponse,
  BillFnWebhookReceipt,
  BillFnWebhookRequest,
  BillFnWebhookResponse,
  BillFnWebhookResponseData,
  BillableSubject,
  BillingAccountResolver,
  BillingProviderName,
  EntitlementStatus,
  SubscriptionStatus
} from './types.js';

const TABLES = {
  billingAccounts: 'billingAccounts',
  subscriptions: 'subscriptions',
  checkoutSessions: 'checkoutSessions',
  entitlementSnapshots: 'entitlementSnapshots',
  usageMeters: 'usageMeters',
  usageLedger: 'usageLedger',
  webhookReceipts: 'webhookReceipts',
  billingEvents: 'billingEvents',
  refunds: 'refunds',
  subscriptionChangeRequests: 'subscriptionChangeRequests',
  reconciliationJobs: 'reconciliationJobs',
  reconciliationCursors: 'reconciliationCursors'
} as const;

type ServiceDeps = {
  db: Adapter;
  namespace: string;
  catalog: BillFnCatalog;
  providers: Partial<Record<BillingProviderName, BillFnProviderAdapter>>;
  resolveBillingAccount: BillingAccountResolver;
  now: () => Date;
  generateId: (prefix: string) => string;
  metrics: MetricsEmitter;
  queue?: QueueAdapter<BillFnQueuedJob>;
};

type ProjectionResult = Awaited<ReturnType<typeof applyVerificationState>>;

export function createBillFnService(config: BillFnConfig) {
  const namespace = config.namespace ?? 'billfn';
  const now = config.now ?? (() => new Date());
  const generateId = config.generateId ?? defaultIdFactory;
  const resolveBillingAccount = config.billingAccountResolver ?? createDefaultBillingAccountResolver();
  const metrics = createNamespacedEmitter('billfn', config.metrics ?? createMetricsEmitter());

  const deps: ServiceDeps = {
    db: config.db,
    namespace,
    catalog: config.catalog,
    providers: config.providers ?? {},
    resolveBillingAccount,
    now,
    generateId,
    metrics,
    queue: config.queue
  };

  const subscriptionProvider = {
    getActiveSubscription: async (subject: BillableSubject) => {
      const billingAccount = await findBillingAccountForSubject(deps, requireSubject(subject));
      if (!billingAccount) {
        return null;
      }
      return findActiveSubscription(deps, billingAccount.id);
    },
    getEntitlementSnapshot: async (subject: BillableSubject) => {
      const billingAccount = await findBillingAccountForSubject(deps, requireSubject(subject));
      if (!billingAccount) {
        return null;
      }
      return findEntitlementSnapshot(deps, billingAccount.id);
    },
    isActive: async (subject: BillableSubject) => {
      const snapshot = await subscriptionProvider.getEntitlementSnapshot(subject);
      return snapshot?.status === 'active' || snapshot?.status === 'trialing' || snapshot?.status === 'grace';
    },
    hasFeature: async (subject: BillableSubject, feature: string) => {
      const snapshot = await subscriptionProvider.getEntitlementSnapshot(subject);
      return Boolean(snapshot?.features[feature]);
    }
  };

  const quotaProvider = {
    checkQuota: async (input: {
      principalId?: string;
      tenantId?: string;
      requestedBytes: number;
      resource?: string;
    }) => {
      assertNonNegativeFiniteAmount(input.requestedBytes, 'requestedBytes');
      const subject = {
        principalId: input.principalId,
        tenantId: input.tenantId
      };
      const resource = input.resource ?? 'storage';
      const entitlements = await subscriptionProvider.getEntitlementSnapshot(subject);
      if (!entitlements || entitlements.status === 'inactive') {
        return {
          allowed: false,
          current: 0,
          limit: 0,
          reason: 'subscription_inactive'
        };
      }
      const usage = await quotaProvider.getUsage(input.principalId, input.tenantId, resource);
      const limit = usage.limit;
      if (limit >= 0 && usage.current + input.requestedBytes > limit) {
        return {
          allowed: false,
          current: usage.current,
          limit,
          reason: 'quota_exceeded'
        };
      }
      return {
        allowed: true,
        current: usage.current,
        limit
      };
    },
    recordUsage: async (input: {
      principalId?: string;
      tenantId?: string;
      bytes: number;
      resource?: string;
    }) => {
      const subject = {
        principalId: input.principalId,
        tenantId: input.tenantId
      };
      const { billingAccount } = await getOrCreateBillingAccount(deps, requireSubject(subject));
      await incrementUsage(deps, billingAccount.id, input.resource ?? 'storage', input.bytes);
    },
    getUsage: async (principalId?: string, tenantId?: string, resource = 'storage') => {
      const subject = {
        principalId,
        tenantId
      };
      const billingAccount = await findBillingAccountForSubject(deps, requireSubject(subject));
      const meter = billingAccount ? await findUsageMeter(deps, billingAccount.id, resource) : null;
      const entitlements = billingAccount ? await findEntitlementSnapshot(deps, billingAccount.id) : null;
      return {
        current: meter?.current ?? 0,
        limit: entitlements?.limits[resource] ?? 0
      };
    }
  };

  async function syncSubscriptionById(subscriptionId: string): Promise<ProjectionResult> {
    const subscription = await getSubscriptionById(deps, subscriptionId);
    if (!subscription) {
      throw createBillFnError({
        code: 'BILLFN_NOT_FOUND',
        message: 'Subscription not found'
      });
    }
    const billingAccount = await getBillingAccountById(deps, subscription.billingAccountId);
    if (!billingAccount) {
      throw createBillFnError({
        code: 'BILLFN_NOT_FOUND',
        message: 'Billing account not found'
      });
    }
    const plan = requirePlan(deps.catalog, subscription.planKey);
    const price = requirePriceById(plan, subscription.priceId);
    const provider = requireProvider(deps, subscription.provider, 'fetchSubscription');
    const verification = await provider.fetchSubscription({
      subscription,
      plan,
      price
    });
    if (!verification) {
      throw createBillFnError({
        code: 'BILLFN_NOT_FOUND',
        message: 'Provider did not return subscription state'
      });
    }
    return applyVerificationState(deps, {
      billingAccount,
      plan,
      price,
      subscription,
      state: verification
    });
  }

  async function createReconciliationJobRecord(input: {
    kind: BillFnReconciliationJobKind;
    provider?: BillingProviderName;
    billingAccountId?: string;
    subscriptionId?: string;
    providerEventId?: string;
    cursor?: string;
    payload?: Record<string, unknown>;
  }) {
    const timestamp = toIsoString(deps.now());
    const job: BillFnReconciliationJob = {
      id: deps.generateId('rcj'),
      kind: input.kind,
      status: 'pending',
      provider: input.provider,
      billingAccountId: input.billingAccountId,
      subscriptionId: input.subscriptionId,
      providerEventId: input.providerEventId,
      cursor: input.cursor,
      attempts: 0,
      payload: input.payload,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await deps.db.create({
      model: TABLES.reconciliationJobs,
      data: job,
      namespace: deps.namespace
    });
    return job;
  }

  async function enqueueReconciliationJobInternal(input: BillFnEnqueueReconciliationJobRequest) {
    const job = await createReconciliationJobRecord(input);
    const queuedJob = jobToQueuePayload(job);
    if (deps.queue) {
      await deps.queue.enqueue('billfn-reconciliation', queuedJob);
    }
    await recordBillingEvent(deps, {
      id: deps.generateId('evt'),
      billingAccountId: input.billingAccountId ?? 'ops',
      type: `billfn.reconciliation.${job.kind}.queued`,
      payload: {
        jobId: job.id,
        provider: job.provider,
        subscriptionId: job.subscriptionId,
        providerEventId: job.providerEventId
      },
      createdAt: toIsoString(deps.now())
    });
    return job;
  }

  async function runReconciliationJobInternal(jobId: string) {
    let job = await getReconciliationJobRecord(deps, jobId);
    if (!job) {
      throw createBillFnError({
        code: 'BILLFN_NOT_FOUND',
        message: 'Reconciliation job not found'
      });
    }
    if (job.status === 'succeeded') {
      return job;
    }

    const runningAt = toIsoString(deps.now());
    job = await deps.db.update<BillFnReconciliationJob>({
      model: TABLES.reconciliationJobs,
      where: [{ field: 'id', operator: 'eq', value: job.id }],
      data: {
        status: 'running',
        attempts: job.attempts + 1,
        error: undefined,
        updatedAt: runningAt
      },
      namespace: deps.namespace
    });

    try {
      await processReconciliationJob(deps, job);
      job = await deps.db.update<BillFnReconciliationJob>({
        model: TABLES.reconciliationJobs,
        where: [{ field: 'id', operator: 'eq', value: job.id }],
        data: {
          status: 'succeeded',
          completedAt: toIsoString(deps.now()),
          updatedAt: toIsoString(deps.now())
        },
        namespace: deps.namespace
      });
      return job;
    } catch (error) {
      await deps.db.update<BillFnReconciliationJob>({
        model: TABLES.reconciliationJobs,
        where: [{ field: 'id', operator: 'eq', value: job.id }],
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: toIsoString(deps.now())
        },
        namespace: deps.namespace
      });
      throw error;
    }
  }

  return {
    namespace,
    async getCatalog() {
      return deps.catalog;
    },
    async createCheckout(input: BillFnCheckoutCreateRequest): Promise<BillFnCreateCheckoutResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const plan = requirePlan(deps.catalog, input.planKey);
      const price = requirePrice(plan, input.provider, input.interval);
      const provider = requireProvider(deps, input.provider, 'createCheckout');
      const checkoutSessionId = deps.generateId('chk');
      const timestamp = toIsoString(deps.now());

      const created = await createCheckoutSessionRecord(deps, {
        checkoutSessionId,
        billingAccountId: billingAccount.id,
        planKey: plan.planKey,
        priceId: price.priceId,
        provider: price.provider,
        status: 'pending',
        metadata: input.metadata,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const providerResult = await provider.createCheckout({
        checkoutSessionId,
        billingAccount,
        plan,
        price,
        metadata: input.metadata,
        customer: input.customer,
        returnUrl: input.returnUrl,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl
      });

      const checkoutSession = await updateCheckoutSession(deps, checkoutSessionId, {
        providerCheckoutId: providerResult.providerCheckoutId,
        providerSubscriptionId: providerResult.providerSubscriptionId,
        providerChargeId: providerResult.providerChargeId,
        status: providerResult.status,
        checkoutUrl: providerResult.checkoutUrl,
        clientAction: providerResult.clientAction,
        metadata: mergeJson(created.metadata, providerResult.raw),
        updatedAt: timestamp
      });

      deps.metrics.track('checkout.created', {
        provider: input.provider,
        planKey: input.planKey
      });

      const response: BillFnCreateCheckoutResponseData = {
        checkoutSession,
        billingAccount,
        plan: {
          planKey: plan.planKey,
          productKey: plan.productKey,
          displayName: plan.displayName
        }
      };

      return ok(response);
    },
    async verifyCheckout(input: BillFnVerifyCheckoutRequest): Promise<BillFnVerifyCheckoutResponse> {
      const checkoutSession = await getCheckoutSession(deps, input.checkoutSessionId);
      if (!checkoutSession) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Checkout session not found'
        });
      }

      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      if (billingAccount.id !== checkoutSession.billingAccountId) {
        throw createBillFnError({
          code: 'BILLFN_CONFLICT',
          message: 'Checkout session does not belong to the resolved billing account'
        });
      }

      const plan = requirePlan(deps.catalog, checkoutSession.planKey);
      const price = requirePriceById(plan, checkoutSession.priceId);
      const provider = requireProvider(deps, checkoutSession.provider, 'verifyCheckout');
      const verification = await provider.verifyCheckout({
        checkoutSession,
        billingAccount,
        plan,
        price,
        payload: input.payload
      });

      const result = await applyVerificationState(deps, {
        billingAccount,
        plan,
        price,
        checkoutSession,
        state: verification
      });

      if (!result.checkoutSession) {
        throw createBillFnError({
          code: 'BILLFN_INTERNAL_ERROR',
          message: 'Checkout verification completed without a checkout session snapshot'
        });
      }

      return ok({
        checkoutSession: result.checkoutSession,
        subscription: result.subscription,
        entitlements: result.entitlements
      });
    },
    async cancelSubscription(input: BillFnCancelSubscriptionRequest): Promise<BillFnCancelSubscriptionResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const subscription = await getSubscriptionForAccount(deps, billingAccount.id, input.subscriptionId);
      if (!subscription) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Subscription not found'
        });
      }
      const plan = requirePlan(deps.catalog, subscription.planKey);
      const price = requirePriceById(plan, subscription.priceId);
      const provider = requireProvider(deps, subscription.provider, 'cancelSubscription');
      const operation = (await provider.cancelSubscription({
        subscription,
        reason: input.reason
      })) ?? {
        operationStatus: 'applied',
        billingState: {
          subscriptionStatus: 'canceled',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: subscription.providerSubscriptionId,
          providerChargeId: subscription.providerChargeId,
          autoRenew: false,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd
        }
      };

      const projection = operation.billingState
        ? await applyVerificationState(deps, {
            billingAccount,
            plan,
            price,
            subscription,
            state: operation.billingState
          })
        : {
            subscription,
            entitlements: (await findEntitlementSnapshot(deps, billingAccount.id)) ?? await upsertEntitlements(
              deps,
              billingAccount.id,
              plan,
              subscription,
              toIsoString(deps.now())
            )
          };

      await recordBillingEvent(deps, {
        id: deps.generateId('evt'),
        billingAccountId: billingAccount.id,
        type: 'billfn.subscription.cancel.requested',
        payload: {
          subscriptionId: subscription.id,
          operationStatus: operation.operationStatus,
          reason: input.reason
        },
        createdAt: toIsoString(deps.now())
      });

      return ok({
        subscription: projection.subscription,
        entitlements: projection.entitlements,
        operationStatus: operation.operationStatus,
        clientAction: operation.clientAction
      });
    },
    async changeSubscription(input: BillFnChangeSubscriptionRequest): Promise<BillFnChangeSubscriptionResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const subscription = await getSubscriptionForAccount(deps, billingAccount.id, input.subscriptionId);
      if (!subscription) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Subscription not found'
        });
      }
      const currentPlan = requirePlan(deps.catalog, subscription.planKey);
      const currentPrice = requirePriceById(currentPlan, subscription.priceId);
      const target = requirePriceReference(deps.catalog, input.targetPriceId);
      if (target.price.provider !== subscription.provider) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Target price provider must match the active subscription provider',
          details: {
            subscriptionProvider: subscription.provider,
            targetProvider: target.price.provider,
            targetPriceId: target.price.priceId
          }
        });
      }
      const provider = requireProvider(deps, subscription.provider, 'changeSubscription');
      const effectiveAt = input.effectiveAt ?? 'immediate';
      const prorationBehavior = input.prorationBehavior ?? 'provider_default';
      const operation = await provider.changeSubscription({
        subscription,
        currentPlan,
        currentPrice,
        targetPlan: target.plan,
        targetPrice: target.price,
        effectiveAt,
        prorationBehavior,
        reason: input.reason
      });

      const timestamp = toIsoString(deps.now());
      const changeRequest = await createSubscriptionChangeRequestRecord(deps, {
        billingAccountId: billingAccount.id,
        subscriptionId: subscription.id,
        provider: subscription.provider,
        currentPriceId: subscription.priceId,
        targetPriceId: target.price.priceId,
        effectiveAt,
        prorationBehavior,
        status: operation.operationStatus === 'applied' ? 'applied' : 'requires_action',
        operationStatus: operation.operationStatus,
        clientAction: operation.clientAction,
        metadata: operation.raw,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const appliesTargetImmediately = operation.operationStatus === 'applied' && effectiveAt === 'immediate';
      const projection = operation.billingState
        ? await applyVerificationState(deps, {
            billingAccount,
            plan: appliesTargetImmediately ? target.plan : currentPlan,
            price: appliesTargetImmediately ? target.price : currentPrice,
            subscription,
            state: operation.billingState
          })
        : {
            subscription,
            entitlements: (await findEntitlementSnapshot(deps, billingAccount.id)) ?? await upsertEntitlements(
              deps,
              billingAccount.id,
              currentPlan,
              subscription,
              timestamp
            )
          };

      await recordBillingEvent(deps, {
        id: deps.generateId('evt'),
        billingAccountId: billingAccount.id,
        type: 'billfn.subscription.change.requested',
        payload: {
          subscriptionId: subscription.id,
          currentPriceId: currentPrice.priceId,
          targetPriceId: target.price.priceId,
          operationStatus: operation.operationStatus
        },
        createdAt: timestamp
      });

      return ok({
        subscription: projection.subscription,
        entitlements: projection.entitlements,
        operationStatus: operation.operationStatus,
        clientAction: operation.clientAction,
        changeRequest
      });
    },
    async resumeSubscription(input: BillFnResumeSubscriptionRequest): Promise<BillFnResumeSubscriptionResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const subscription = await getSubscriptionForAccount(deps, billingAccount.id, input.subscriptionId);
      if (!subscription) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Subscription not found'
        });
      }
      const plan = requirePlan(deps.catalog, subscription.planKey);
      const price = requirePriceById(plan, subscription.priceId);
      const provider = requireProvider(deps, subscription.provider, 'resumeSubscription');
      const operation = await provider.resumeSubscription({
        subscription
      });

      const projection = operation.billingState
        ? await applyVerificationState(deps, {
            billingAccount,
            plan,
            price,
            subscription,
            state: operation.billingState
          })
        : {
            subscription,
            entitlements: (await findEntitlementSnapshot(deps, billingAccount.id)) ?? await upsertEntitlements(
              deps,
              billingAccount.id,
              plan,
              subscription,
              toIsoString(deps.now())
            )
          };

      await recordBillingEvent(deps, {
        id: deps.generateId('evt'),
        billingAccountId: billingAccount.id,
        type: 'billfn.subscription.resume.requested',
        payload: {
          subscriptionId: subscription.id,
          operationStatus: operation.operationStatus
        },
        createdAt: toIsoString(deps.now())
      });

      return ok({
        subscription: projection.subscription,
        entitlements: projection.entitlements,
        operationStatus: operation.operationStatus,
        clientAction: operation.clientAction
      });
    },
    async refundCharge(input: BillFnRefundChargeRequest): Promise<BillFnRefundChargeResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const subscription = input.subscriptionId
        ? await getSubscriptionForAccount(deps, billingAccount.id, input.subscriptionId)
        : await findActiveSubscription(deps, billingAccount.id);
      const providerName = subscription?.provider;
      if (!providerName) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Subscription not found for refund'
        });
      }
      const provider = requireProvider(deps, providerName, 'refundCharge');
      const mode = input.mode ?? 'full';
      const providerChargeId = input.providerChargeId ?? subscription?.providerChargeId;
      const operation = await provider.refundCharge({
        subscription: subscription ?? undefined,
        billingAccount,
        providerChargeId,
        mode,
        amount: input.amount,
        reason: input.reason
      });

      const timestamp = toIsoString(deps.now());
      const refund = await createRefundRecord(deps, {
        billingAccountId: billingAccount.id,
        subscriptionId: subscription?.id,
        provider: providerName,
        providerChargeId,
        providerRefundId: operation.providerRefundId,
        mode,
        amount: input.amount,
        currency: subscription ? requirePriceById(requirePlan(deps.catalog, subscription.planKey), subscription.priceId).currency : undefined,
        reason: input.reason,
        status: operation.operationStatus === 'applied' ? 'succeeded' : 'requires_action',
        operationStatus: operation.operationStatus,
        metadata: operation.raw,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      let projectedSubscription = subscription ?? null;
      let projectedEntitlements = subscription ? await findEntitlementSnapshot(deps, billingAccount.id) : null;
      if (subscription && operation.billingState) {
        const plan = requirePlan(deps.catalog, subscription.planKey);
        const price = requirePriceById(plan, subscription.priceId);
        const projection = await applyVerificationState(deps, {
          billingAccount,
          plan,
          price,
          subscription,
          state: operation.billingState
        });
        projectedSubscription = projection.subscription;
        projectedEntitlements = projection.entitlements;
      }

      await recordBillingEvent(deps, {
        id: deps.generateId('evt'),
        billingAccountId: billingAccount.id,
        type: 'billfn.refund.requested',
        payload: {
          refundId: refund.id,
          subscriptionId: subscription?.id,
          operationStatus: operation.operationStatus,
          mode
        },
        createdAt: timestamp
      });

      return ok({
        refund,
        subscription: projectedSubscription,
        entitlements: projectedEntitlements,
        operationStatus: operation.operationStatus,
        clientAction: operation.clientAction
      });
    },
    async syncSubscription(input: BillFnSyncSubscriptionRequest): Promise<BillFnSyncSubscriptionResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const subscription = await getSubscriptionForAccount(deps, billingAccount.id, input.subscriptionId);
      if (!subscription) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Subscription not found'
        });
      }

      const applied = await syncSubscriptionById(subscription.id);

      const response: BillFnSyncSubscriptionResponseData = {
        subscription: applied.subscription,
        entitlements: applied.entitlements
      };
      return ok(response);
    },
    async restorePurchases(input: BillFnRestorePurchasesRequest): Promise<BillFnRestorePurchasesResponse> {
      const subject = requireSubject(input.subject);
      const { billingAccount } = await getOrCreateBillingAccount(deps, subject);
      const plan = requirePlan(deps.catalog, input.planKey);
      const checkoutSession = await findCheckoutSessionByProviderRef(
        deps,
        input.provider,
        undefined,
        undefined,
        input.purchaseReference
      );
      const matchingPrices = plan.prices.filter((candidate) => candidate.provider === input.provider);
      const price = input.priceId
        ? requirePriceById(plan, input.priceId)
        : checkoutSession
          ? requirePriceById(plan, checkoutSession.priceId)
          : matchingPrices.length === 1
            ? matchingPrices[0]
            : undefined;
      if (!price || price.provider !== input.provider) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Restore purchases requires a priceId when the provider has multiple matching prices',
          details: {
            provider: input.provider,
            priceId: input.priceId,
            matchingPriceIds: matchingPrices.map((candidate) => candidate.priceId)
          }
        });
      }
      const provider = requireProvider(deps, input.provider, 'restorePurchases');
      const states = await provider.restorePurchases({
        billingAccount,
        plan,
        price,
        purchaseReference: input.purchaseReference,
        payload: input.payload
      });

      if (states.length === 0) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'No purchases were restored'
        });
      }

      for (const state of states) {
        const projection = await resolveProjectionContextForProviderState(deps, {
          provider: input.provider,
          state,
          checkoutReferenceId: input.purchaseReference
        });

        if (!projection) {
          continue;
        }

        if (projection.billingAccount.id !== billingAccount.id) {
          continue;
        }

        const applied = await applyVerificationState(deps, {
          billingAccount: projection.billingAccount,
          plan: projection.plan,
          price: projection.price,
          checkoutSession: projection.checkoutSession ?? undefined,
          subscription: projection.subscription ?? undefined,
          state
        });

        const response: BillFnRestorePurchasesResponseData = {
          subscription: applied.subscription,
          entitlements: applied.entitlements
        };
        return ok(response);
      }

      throw createBillFnError({
        code: 'BILLFN_CONFLICT',
        message: 'No restored purchase could be linked to the resolved billing account'
      });
    },
    async getEntitlements(subject: BillableSubject): Promise<BillFnEntitlementsResponse> {
      const resolved = await resolveBillingAccountReference(deps, requireSubject(subject));
      const billingAccount = await getBillingAccountById(deps, resolved.billingAccountId);
      if (!billingAccount) {
        return ok({
          billingAccount: buildVirtualBillingAccount(resolved, deps),
          entitlements: null,
          subscription: null
        });
      }
      const entitlements = await findEntitlementSnapshot(deps, billingAccount.id);
      const subscription = await findActiveSubscription(deps, billingAccount.id);
      const response: BillFnEntitlementsResponseData = {
        billingAccount,
        entitlements,
        subscription
      };
      return ok(response);
    },
    async getUsage(subject: BillableSubject, resource?: string): Promise<BillFnUsageResponse> {
      const resolved = await resolveBillingAccountReference(deps, requireSubject(subject));
      const billingAccount = await getBillingAccountById(deps, resolved.billingAccountId);
      const entitlements = billingAccount ? await findEntitlementSnapshot(deps, billingAccount.id) : null;
      const meters = billingAccount
        ? resource
          ? await findUsageMeters(deps, billingAccount.id, resource)
          : await deps.db.findMany<BillFnUsageMeter>({
              model: TABLES.usageMeters,
              where: [{ field: 'billingAccountId', operator: 'eq', value: billingAccount.id }],
              namespace: deps.namespace
            })
        : [];
      const usage = meters.map((meter) => ({
        resource: meter.resource,
        current: meter.current,
        limit: entitlements?.limits[meter.resource] ?? 0
      }));
      const response: BillFnUsageResponseData = {
        billingAccount: billingAccount ?? buildVirtualBillingAccount(resolved, deps),
        usage
      };
      return ok(response);
    },
    async handleWebhook(input: BillFnWebhookRequest): Promise<BillFnWebhookResponse> {
      const provider = requireProvider(deps, input.provider, 'parseWebhook');
      const events = await provider.parseWebhook({
        headers: input.headers,
        rawBody: input.rawBody
      });
      let processed = 0;

      for (const event of events) {
        if (!event.signatureVerified) {
          deps.metrics.track('webhook.signature.invalid', {
            provider: input.provider
          });
          throw createBillFnError({
            code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID',
            message: 'Webhook signature verification failed'
          });
        }

        const receiptId = buildWebhookReceiptId(input.provider, event.providerEventId);
        const receipt: BillFnWebhookReceipt = {
          id: receiptId,
          provider: input.provider,
          providerEventId: event.providerEventId,
          eventType: event.type,
          signatureVerified: event.signatureVerified,
          rawPayload: {
            raw: event.raw,
            parsed: serializeParsedWebhookEvent(event)
          },
          createdAt: toIsoString(deps.now())
        };
        try {
          await deps.db.create({
            model: TABLES.webhookReceipts,
            data: receipt,
            namespace: deps.namespace
          });
        } catch (error) {
          if (!isDuplicateRecordError(error)) {
            throw error;
          }
          continue;
        }

        const job = await enqueueReconciliationJobInternal({
          kind: 'webhook-event',
          provider: input.provider,
          providerEventId: event.providerEventId,
          payload: {
            parsedEvent: serializeParsedWebhookEvent(event)
          }
        });

        if (!deps.queue) {
          await runReconciliationJobInternal(job.id);
        }

        processed += 1;
      }

      const response: BillFnWebhookResponseData = {
        accepted: true,
        processed
      };
      return ok(response);
    },
    async enqueueReconciliationJob(input: BillFnEnqueueReconciliationJobRequest): Promise<BillFnReconciliationJobResponse> {
      const job = await enqueueReconciliationJobInternal(input);
      return ok({ job });
    },
    async getReconciliationJob(input: BillFnGetReconciliationJobRequest): Promise<BillFnReconciliationJobResponse> {
      const job = await getReconciliationJobRecord(deps, input.jobId);
      if (!job) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Reconciliation job not found'
        });
      }
      return ok({ job });
    },
    async runReconciliationJob(input: BillFnRunReconciliationJobRequest): Promise<BillFnReconciliationJobResponse> {
      const job = await runReconciliationJobInternal(input.jobId);
      return ok({ job });
    },
    subscriptionProvider,
    quotaProvider
  };
}

export function createBillFnReconciliationWorker(config: BillFnConfig) {
  const service = createBillFnService(config);
  const queue = config.queue;

  return {
    async run(job: BillFnQueuedJob) {
      if (job.jobId) {
        const result = await service.runReconciliationJob({ jobId: job.jobId });
        return result.ok ? result.data.job : null;
      }

      const enqueued = await service.enqueueReconciliationJob({
        kind: job.type,
        provider: 'provider' in job ? job.provider : undefined,
        billingAccountId: 'billingAccountId' in job ? job.billingAccountId : undefined,
        subscriptionId: 'subscriptionId' in job ? job.subscriptionId : undefined,
        providerEventId: 'providerEventId' in job ? job.providerEventId : undefined,
        cursor: 'cursor' in job ? job.cursor : undefined
      });
      if (!enqueued.ok) {
        return null;
      }
      const ran = await service.runReconciliationJob({ jobId: enqueued.data.job.id });
      return ran.ok ? ran.data.job : null;
    },
    async runNext() {
      if (!queue) {
        return null;
      }
      const job = await queue.dequeue('billfn-reconciliation');
      if (!job) {
        return null;
      }
      return this.run(job);
    }
  };
}

async function processReconciliationJob(deps: ServiceDeps, job: BillFnReconciliationJob) {
  switch (job.kind) {
    case 'webhook-event':
    case 'webhook-replay': {
      if (!job.provider || !job.providerEventId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Webhook reconciliation requires provider and providerEventId'
        });
      }
      const receipt = await deps.db.findOne<BillFnWebhookReceipt>({
        model: TABLES.webhookReceipts,
        where: [
          { field: 'provider', operator: 'eq', value: job.provider },
          { field: 'providerEventId', operator: 'eq', value: job.providerEventId }
        ],
        namespace: deps.namespace
      });
      if (!receipt) {
        throw createBillFnError({
          code: 'BILLFN_NOT_FOUND',
          message: 'Webhook receipt not found'
        });
      }
      if (receipt.processedAt && job.kind === 'webhook-event') {
        return;
      }
      const parsed = deserializeParsedWebhookEvent(asRecord(receipt.rawPayload)?.parsed);
      if (parsed?.billingState) {
        await processParsedWebhookEvent(deps, job.provider, parsed);
      }
      await deps.db.update({
        model: TABLES.webhookReceipts,
        where: [{ field: 'id', operator: 'eq', value: receipt.id }],
        data: {
          processedAt: toIsoString(deps.now())
        },
        namespace: deps.namespace
      });
      return;
    }
    case 'subscription-sync': {
      if (!job.subscriptionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Subscription sync job requires subscriptionId'
        });
      }
      await syncSubscriptionByIdForJob(deps, job.subscriptionId);
      return;
    }
    case 'account-scan': {
      if (!job.billingAccountId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Account scan job requires billingAccountId'
        });
      }
      const where: WhereClause[] = [{ field: 'billingAccountId', operator: 'eq', value: job.billingAccountId }];
      if (job.provider) {
        where.push({ field: 'provider', operator: 'eq', value: job.provider });
      }
      const subscriptions = await deps.db.findMany<BillFnSubscription>({
        model: TABLES.subscriptions,
        where,
        orderBy: [{ field: 'updatedAt', direction: 'desc' }],
        namespace: deps.namespace
      });
      for (const subscription of subscriptions) {
        await syncSubscriptionByIdForJob(deps, subscription.id);
      }
      return;
    }
    case 'notification-history-backfill': {
      if (!job.provider) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Notification history backfill requires provider'
        });
      }
      const provider = requireProvider(deps, job.provider, 'fetchNotificationHistory');
      const cursorKey = 'default';
      const cursorRecord = await findReconciliationCursor(deps, job.provider, cursorKey);
      const history = await provider.fetchNotificationHistory({
        cursor: job.cursor ?? cursorRecord?.cursor,
        limit: 20
      } satisfies BillFnFetchNotificationHistoryInput);

      for (const event of history.events) {
        const receiptId = buildWebhookReceiptId(job.provider, event.providerEventId);
        const receipt: BillFnWebhookReceipt = {
          id: receiptId,
          provider: job.provider,
          providerEventId: event.providerEventId,
          eventType: event.type,
          signatureVerified: event.signatureVerified,
          rawPayload: {
            raw: event.raw,
            parsed: serializeParsedWebhookEvent(event)
          },
          createdAt: toIsoString(deps.now()),
          processedAt: undefined
        };
        const existingReceipt = await deps.db.findOne<BillFnWebhookReceipt>({
          model: TABLES.webhookReceipts,
          where: [{ field: 'id', operator: 'eq', value: receiptId }],
          namespace: deps.namespace
        });
        if (existingReceipt) {
          continue;
        }
        if (!event.signatureVerified) {
          throw createBillFnError({
            code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID',
            message: 'Notification history event signature verification failed'
          });
        }
        if (!existingReceipt) {
          try {
            await deps.db.create({
              model: TABLES.webhookReceipts,
              data: receipt,
              namespace: deps.namespace
            });
          } catch (error) {
            if (!isDuplicateRecordError(error)) {
              throw error;
            }
            continue;
          }
        }
        try {
          await processParsedWebhookEvent(deps, job.provider, event);
        } catch (error) {
          if (!isBillFnNotFoundError(error)) {
            throw error;
          }
          deps.metrics.track('reconciliation.event.skipped', {
            provider: job.provider,
            providerEventId: event.providerEventId,
            reason: 'billing_account_not_found'
          });
        }
        await deps.db.update({
          model: TABLES.webhookReceipts,
          where: [{ field: 'id', operator: 'eq', value: receiptId }],
          data: {
            processedAt: toIsoString(deps.now())
          },
          namespace: deps.namespace
        });
      }

      await upsertReconciliationCursor(deps, {
        provider: job.provider,
        cursorKey,
        cursor: history.nextCursor,
        metadata: {
          jobId: job.id
        }
      });
      return;
    }
  }
}

async function syncSubscriptionByIdForJob(deps: ServiceDeps, subscriptionId: string) {
  const subscription = await getSubscriptionById(deps, subscriptionId);
  if (!subscription) {
    return;
  }
  const billingAccount = await getBillingAccountById(deps, subscription.billingAccountId);
  if (!billingAccount) {
    return;
  }
  const plan = requirePlan(deps.catalog, subscription.planKey);
  const price = requirePriceById(plan, subscription.priceId);
  const provider = requireProvider(deps, subscription.provider, 'fetchSubscription');
  const verification = await provider.fetchSubscription({
    subscription,
    plan,
    price
  });
  if (!verification) {
    return;
  }
  await applyVerificationState(deps, {
    billingAccount,
    plan,
    price,
    subscription,
    state: verification
  });
}

async function getOrCreateBillingAccount(
  deps: ServiceDeps,
  subject: BillableSubject
): Promise<{ billingAccount: BillFnBillingAccount; existed: boolean }> {
  const resolved = await resolveBillingAccountReference(deps, subject);
  const existing = await deps.db.findOne<BillFnBillingAccount>({
    model: TABLES.billingAccounts,
    where: [{ field: 'id', operator: 'eq', value: resolved.billingAccountId }],
    namespace: deps.namespace
  });
  if (existing) {
    return {
      billingAccount: existing,
      existed: true
    };
  }

  const timestamp = toIsoString(deps.now());
  const created: BillFnBillingAccount = {
    id: resolved.billingAccountId,
    ownerType: resolved.ownerType,
    ownerId: resolved.ownerId,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  try {
    await deps.db.create({
      model: TABLES.billingAccounts,
      data: created,
      namespace: deps.namespace
    });
  } catch (error) {
    if (!isDuplicateRecordError(error)) {
      throw error;
    }
    const duplicate = await deps.db.findOne<BillFnBillingAccount>({
      model: TABLES.billingAccounts,
      where: [{ field: 'id', operator: 'eq', value: resolved.billingAccountId }],
      namespace: deps.namespace
    });
    if (duplicate) {
      return {
        billingAccount: duplicate,
        existed: true
      };
    }
    throw error;
  }

  return {
    billingAccount: created,
    existed: false
  };
}

async function resolveBillingAccountReference(deps: ServiceDeps, subject: BillableSubject) {
  const resolved = await deps.resolveBillingAccount.resolve(subject);
  if (!resolved) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'Unable to resolve a billing account from the provided subject'
    });
  }
  return resolved;
}

async function findBillingAccountForSubject(deps: ServiceDeps, subject: BillableSubject) {
  const resolved = await resolveBillingAccountReference(deps, subject);
  return getBillingAccountById(deps, resolved.billingAccountId);
}

function buildVirtualBillingAccount(
  resolved: Awaited<ReturnType<BillingAccountResolver['resolve']>> extends infer T ? Exclude<T, null> : never,
  deps: ServiceDeps
): BillFnBillingAccount {
  const timestamp = toIsoString(deps.now());
  return {
    id: resolved.billingAccountId,
    ownerType: resolved.ownerType,
    ownerId: resolved.ownerId,
    metadata: {
      virtual: true
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function requirePlan(catalog: BillFnCatalog, planKey: string) {
  const plan = resolvePlan(catalog, planKey);
  if (!plan) {
    throw createBillFnError({
      code: 'BILLFN_NOT_FOUND',
      message: `Plan not found: ${planKey}`
    });
  }
  return plan;
}

function requirePrice(
  plan: ReturnType<typeof requirePlan>,
  provider: BillingProviderName,
  interval: BillFnPriceDefinition['interval'] | undefined
) {
  const price = resolvePrice(plan, provider, interval);
  if (!price) {
    throw createBillFnError({
      code: 'BILLFN_CATALOG_PRICE_NOT_FOUND',
      message: `No configured price for ${plan.planKey} on ${provider}${interval ? ` (${interval})` : ''}`
    });
  }
  return price;
}

function requirePriceById(plan: ReturnType<typeof requirePlan>, priceId: string) {
  const price = plan.prices.find((candidate) => candidate.priceId === priceId);
  if (!price) {
    throw createBillFnError({
      code: 'BILLFN_CATALOG_PRICE_NOT_FOUND',
      message: `No configured price found for ${priceId}`
    });
  }
  return price;
}

function requirePriceReference(catalog: BillFnCatalog, priceId: string) {
  for (const plan of catalog.plans) {
    const price = plan.prices.find((candidate) => candidate.priceId === priceId);
    if (price) {
      return { plan, price };
    }
  }
  throw createBillFnError({
    code: 'BILLFN_CATALOG_PRICE_NOT_FOUND',
    message: `No configured price found for ${priceId}`
  });
}

function requireProvider<
  TCapability extends keyof BillFnProviderAdapter
>(deps: ServiceDeps, providerName: BillingProviderName, capability: TCapability) {
  const provider = deps.providers[providerName];
  if (!provider) {
    throw createBillFnError({
      code: 'BILLFN_PROVIDER_UNSUPPORTED',
      message: `Provider is not configured: ${providerName}`
    });
  }
  const capabilityValue = provider[capability];
  if (typeof capabilityValue !== 'function') {
    throw createBillFnError({
      code: 'BILLFN_PROVIDER_UNSUPPORTED',
      message: `Provider does not support ${String(capability)}: ${providerName}`
    });
  }
  return provider as BillFnProviderAdapter & Required<Pick<BillFnProviderAdapter, TCapability>>;
}

function requireSubject(subject: BillableSubject | undefined): BillableSubject {
  if (!subject) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'A billing subject is required'
    });
  }

  const hasIdentifier = Boolean(subject.actorId || subject.principalId || subject.organizationId || subject.tenantId);

  if (!hasIdentifier) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'A billing subject must include an actor, principal, tenant, or organization identifier'
    });
  }

  return subject;
}

async function createCheckoutSessionRecord(
  deps: ServiceDeps,
  session: BillFnCheckoutSession
): Promise<BillFnCheckoutSession> {
  await deps.db.create({
    model: TABLES.checkoutSessions,
    data: session,
    namespace: deps.namespace
  });
  return session;
}

async function updateCheckoutSession(
  deps: ServiceDeps,
  checkoutSessionId: string,
  patch: Partial<BillFnCheckoutSession>
): Promise<BillFnCheckoutSession> {
  return deps.db.update<BillFnCheckoutSession>({
    model: TABLES.checkoutSessions,
    where: [{ field: 'checkoutSessionId', operator: 'eq', value: checkoutSessionId }],
    data: patch,
    namespace: deps.namespace
  });
}

async function getCheckoutSession(deps: ServiceDeps, checkoutSessionId: string) {
  return deps.db.findOne<BillFnCheckoutSession>({
    model: TABLES.checkoutSessions,
    where: [{ field: 'checkoutSessionId', operator: 'eq', value: checkoutSessionId }],
    namespace: deps.namespace
  });
}

async function getBillingAccountById(deps: ServiceDeps, id: string) {
  return deps.db.findOne<BillFnBillingAccount>({
    model: TABLES.billingAccounts,
    where: [{ field: 'id', operator: 'eq', value: id }],
    namespace: deps.namespace
  });
}

async function getSubscriptionById(deps: ServiceDeps, id: string) {
  return deps.db.findOne<BillFnSubscription>({
    model: TABLES.subscriptions,
    where: [{ field: 'id', operator: 'eq', value: id }],
    namespace: deps.namespace
  });
}

async function getSubscriptionForAccount(deps: ServiceDeps, billingAccountId: string, subscriptionId?: string) {
  if (subscriptionId) {
    return deps.db.findOne<BillFnSubscription>({
      model: TABLES.subscriptions,
      where: [
        { field: 'id', operator: 'eq', value: subscriptionId },
        { field: 'billingAccountId', operator: 'eq', value: billingAccountId }
      ],
      namespace: deps.namespace
    });
  }
  return findActiveSubscription(deps, billingAccountId);
}

async function findActiveSubscription(deps: ServiceDeps, billingAccountId: string) {
  const candidates = await deps.db.findMany<BillFnSubscription>({
    model: TABLES.subscriptions,
    where: [
      { field: 'billingAccountId', operator: 'eq', value: billingAccountId },
      { field: 'status', operator: 'in', value: ['trialing', 'active', 'grace', 'past_due', 'pending', 'paused'] }
    ],
    orderBy: [{ field: 'updatedAt', direction: 'desc' }],
    namespace: deps.namespace
  });
  return candidates[0] ?? null;
}

async function findSubscriptionByProviderRef(
  deps: ServiceDeps,
  provider: BillingProviderName,
  providerSubscriptionId?: string,
  providerChargeId?: string,
  checkoutReferenceId?: string
) {
  const whereSets: WhereClause[][] = [];
  if (providerSubscriptionId) {
    whereSets.push([
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerSubscriptionId', operator: 'eq', value: providerSubscriptionId }
    ]);
  }
  if (providerChargeId) {
    whereSets.push([
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerChargeId', operator: 'eq', value: providerChargeId }
    ]);
  }
  if (checkoutReferenceId) {
    const session = await deps.db.findOne<BillFnCheckoutSession>({
      model: TABLES.checkoutSessions,
      where: [{ field: 'checkoutSessionId', operator: 'eq', value: checkoutReferenceId }],
      namespace: deps.namespace
    });
    if (session?.providerSubscriptionId) {
      whereSets.push([
        { field: 'provider', operator: 'eq', value: provider },
        { field: 'providerSubscriptionId', operator: 'eq', value: session.providerSubscriptionId }
      ]);
    }
  }

  for (const where of whereSets) {
    const found = await deps.db.findOne<BillFnSubscription>({
      model: TABLES.subscriptions,
      where,
      namespace: deps.namespace
    });
    if (found) {
      return found;
    }
  }
  return null;
}

async function findCheckoutSessionByProviderRef(
  deps: ServiceDeps,
  provider: BillingProviderName,
  providerSubscriptionId?: string,
  providerChargeId?: string,
  checkoutReferenceId?: string
) {
  const whereSets: WhereClause[][] = [];

  if (checkoutReferenceId) {
    whereSets.push([{ field: 'checkoutSessionId', operator: 'eq', value: checkoutReferenceId }]);
    whereSets.push([
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerCheckoutId', operator: 'eq', value: checkoutReferenceId }
    ]);
  }

  if (providerSubscriptionId) {
    whereSets.push([
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerSubscriptionId', operator: 'eq', value: providerSubscriptionId }
    ]);
  }

  if (providerChargeId) {
    whereSets.push([
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'providerChargeId', operator: 'eq', value: providerChargeId }
    ]);
  }

  for (const where of whereSets) {
    const found = await deps.db.findOne<BillFnCheckoutSession>({
      model: TABLES.checkoutSessions,
      where,
      namespace: deps.namespace
    });
    if (found) {
      return found;
    }
  }

  return null;
}

async function findEntitlementSnapshot(deps: ServiceDeps, billingAccountId: string) {
  return deps.db.findOne<BillFnEntitlementSnapshot>({
    model: TABLES.entitlementSnapshots,
    where: [{ field: 'billingAccountId', operator: 'eq', value: billingAccountId }],
    namespace: deps.namespace
  });
}

async function findUsageMeter(deps: ServiceDeps, billingAccountId: string, resource: string) {
  return deps.db.findOne<BillFnUsageMeter>({
    model: TABLES.usageMeters,
    where: [
      { field: 'billingAccountId', operator: 'eq', value: billingAccountId },
      { field: 'resource', operator: 'eq', value: resource }
    ],
    namespace: deps.namespace
  });
}

async function findUsageMeters(deps: ServiceDeps, billingAccountId: string, resource: string) {
  return deps.db.findMany<BillFnUsageMeter>({
    model: TABLES.usageMeters,
    where: [
      { field: 'billingAccountId', operator: 'eq', value: billingAccountId },
      { field: 'resource', operator: 'eq', value: resource }
    ],
    namespace: deps.namespace
  });
}

async function getReconciliationJobRecord(deps: ServiceDeps, id: string) {
  return deps.db.findOne<BillFnReconciliationJob>({
    model: TABLES.reconciliationJobs,
    where: [{ field: 'id', operator: 'eq', value: id }],
    namespace: deps.namespace
  });
}

async function findReconciliationCursor(deps: ServiceDeps, provider: BillingProviderName, cursorKey: string) {
  return deps.db.findOne<BillFnReconciliationCursor>({
    model: TABLES.reconciliationCursors,
    where: [
      { field: 'provider', operator: 'eq', value: provider },
      { field: 'cursorKey', operator: 'eq', value: cursorKey }
    ],
    namespace: deps.namespace
  });
}

async function upsertReconciliationCursor(
  deps: ServiceDeps,
  input: Omit<BillFnReconciliationCursor, 'id' | 'updatedAt'> & { id?: string; updatedAt?: string }
) {
  const existing = await findReconciliationCursor(deps, input.provider, input.cursorKey);
  const record: BillFnReconciliationCursor = {
    id: existing?.id ?? input.id ?? deps.generateId('rcc'),
    provider: input.provider,
    cursorKey: input.cursorKey,
    cursor: input.cursor,
    metadata: input.metadata,
    updatedAt: input.updatedAt ?? toIsoString(deps.now())
  };
  if (existing) {
    return deps.db.update<BillFnReconciliationCursor>({
      model: TABLES.reconciliationCursors,
      where: [{ field: 'id', operator: 'eq', value: existing.id }],
      data: record,
      namespace: deps.namespace
    });
  }
  try {
    return await deps.db.create<BillFnReconciliationCursor>({
      model: TABLES.reconciliationCursors,
      data: record,
      namespace: deps.namespace
    });
  } catch (error) {
    if (!isDuplicateRecordError(error)) {
      throw error;
    }
    const duplicate = await findReconciliationCursor(deps, input.provider, input.cursorKey);
    if (!duplicate) {
      throw error;
    }
    return deps.db.update<BillFnReconciliationCursor>({
      model: TABLES.reconciliationCursors,
      where: [{ field: 'id', operator: 'eq', value: duplicate.id }],
      data: {
        ...record,
        id: duplicate.id
      },
      namespace: deps.namespace
    });
  }
}

function mapSubscriptionToEntitlementStatus(status: SubscriptionStatus): EntitlementStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'grace':
    case 'past_due':
      return 'grace';
    default:
      return 'inactive';
  }
}

async function applyVerificationState(
  deps: ServiceDeps,
  input: {
    billingAccount: BillFnBillingAccount;
    plan: ReturnType<typeof requirePlan>;
    price: BillFnPriceDefinition;
    checkoutSession?: BillFnCheckoutSession;
    subscription?: BillFnSubscription;
    state: NonNullable<Awaited<ReturnType<NonNullable<BillFnProviderAdapter['verifyCheckout']>>>>;
  }
) {
  const timestamp = toIsoString(deps.now());
  const checkoutSession = input.checkoutSession
    ? await updateCheckoutSession(deps, input.checkoutSession.checkoutSessionId, {
        status: input.state.checkoutStatus,
        providerSubscriptionId: input.state.providerSubscriptionId ?? input.checkoutSession.providerSubscriptionId,
        providerChargeId: input.state.providerChargeId ?? input.checkoutSession.providerChargeId,
        updatedAt: timestamp,
        metadata: mergeJson(input.checkoutSession.metadata, input.state.raw)
      })
    : input.checkoutSession;

  const baseSubscription =
    input.subscription ??
    (await findSubscriptionByProviderRef(
      deps,
      input.price.provider,
      input.state.providerSubscriptionId,
      input.state.providerChargeId,
      checkoutSession?.checkoutSessionId
    ));

  const subscriptionId = baseSubscription?.id ?? deps.generateId('sub');
  const record: BillFnSubscription = {
    id: subscriptionId,
    billingAccountId: input.billingAccount.id,
    planKey: input.plan.planKey,
    priceId: input.price.priceId,
    provider: input.price.provider,
    providerSubscriptionId: input.state.providerSubscriptionId ?? baseSubscription?.providerSubscriptionId,
    providerCheckoutId: checkoutSession?.providerCheckoutId ?? baseSubscription?.providerCheckoutId,
    providerChargeId: input.state.providerChargeId ?? baseSubscription?.providerChargeId,
    status: input.state.subscriptionStatus,
    currentPeriodStart: input.state.currentPeriodStart ?? baseSubscription?.currentPeriodStart,
    currentPeriodEnd: input.state.currentPeriodEnd ?? baseSubscription?.currentPeriodEnd,
    autoRenew: input.state.autoRenew ?? baseSubscription?.autoRenew ?? false,
    metadata: mergeJson(baseSubscription?.metadata, input.state.raw),
    createdAt: baseSubscription?.createdAt ?? timestamp,
    updatedAt: timestamp,
    cancelAt: baseSubscription?.cancelAt,
    canceledAt: input.state.subscriptionStatus === 'canceled' ? timestamp : baseSubscription?.canceledAt,
    trialEnd: baseSubscription?.trialEnd
  };

  const subscription = baseSubscription
    ? await deps.db.update<BillFnSubscription>({
        model: TABLES.subscriptions,
        where: [{ field: 'id', operator: 'eq', value: baseSubscription.id }],
        data: record,
        namespace: deps.namespace
      })
    : await deps.db.create<BillFnSubscription>({
        model: TABLES.subscriptions,
        data: record,
        namespace: deps.namespace
      });

  const entitlements = await upsertEntitlements(deps, input.billingAccount.id, input.plan, subscription, timestamp);

  await recordBillingEvent(deps, {
    id: deps.generateId('evt'),
    billingAccountId: input.billingAccount.id,
    type: `billfn.subscription.${subscription.status}`,
    payload: {
      subscriptionId: subscription.id,
      provider: subscription.provider,
      priceId: subscription.priceId
    },
    createdAt: timestamp
  });

  deps.metrics.track('subscription.updated', {
    provider: subscription.provider,
    status: subscription.status
  });

  return {
    checkoutSession: checkoutSession ?? input.checkoutSession,
    subscription,
    entitlements
  };
}

async function upsertEntitlements(
  deps: ServiceDeps,
  billingAccountId: string,
  plan: ReturnType<typeof requirePlan>,
  subscription: BillFnSubscription,
  timestamp: string
) {
  const existing = await findEntitlementSnapshot(deps, billingAccountId);
  const snapshot: BillFnEntitlementSnapshot = {
    id: existing?.id ?? `ent_${billingAccountId}`,
    billingAccountId,
    planKey: plan.planKey,
    status: mapSubscriptionToEntitlementStatus(subscription.status),
    features: { ...plan.features },
    limits: { ...plan.limits },
    effectiveAt: timestamp,
    expiresAt: subscription.currentPeriodEnd,
    sourceEventId: subscription.id,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  if (existing) {
    return deps.db.update<BillFnEntitlementSnapshot>({
      model: TABLES.entitlementSnapshots,
      where: [{ field: 'billingAccountId', operator: 'eq', value: billingAccountId }],
      data: snapshot,
      namespace: deps.namespace
    });
  }

  try {
    return await deps.db.create<BillFnEntitlementSnapshot>({
      model: TABLES.entitlementSnapshots,
      data: snapshot,
      namespace: deps.namespace
    });
  } catch (error) {
    if (!isDuplicateRecordError(error)) {
      throw error;
    }
    const duplicate = await findEntitlementSnapshot(deps, billingAccountId);
    if (!duplicate) {
      throw error;
    }
    return deps.db.update<BillFnEntitlementSnapshot>({
      model: TABLES.entitlementSnapshots,
      where: [{ field: 'billingAccountId', operator: 'eq', value: billingAccountId }],
      data: {
        ...snapshot,
        id: duplicate.id,
        createdAt: duplicate.createdAt
      },
      namespace: deps.namespace
    });
  }
}

async function recordBillingEvent(deps: ServiceDeps, event: BillFnBillingEvent) {
  await deps.db.create({
    model: TABLES.billingEvents,
    data: event,
    namespace: deps.namespace
  });
}

async function createRefundRecord(
  deps: ServiceDeps,
  input: Omit<BillFnRefund, 'id'>
) {
  const refund: BillFnRefund = {
    id: deps.generateId('rfd'),
    ...input
  };
  await deps.db.create({
    model: TABLES.refunds,
    data: refund,
    namespace: deps.namespace
  });
  return refund;
}

async function createSubscriptionChangeRequestRecord(
  deps: ServiceDeps,
  input: Omit<BillFnSubscriptionChangeRequest, 'id'>
) {
  const changeRequest: BillFnSubscriptionChangeRequest = {
    id: deps.generateId('scr'),
    ...input
  };
  await deps.db.create({
    model: TABLES.subscriptionChangeRequests,
    data: changeRequest,
    namespace: deps.namespace
  });
  return changeRequest;
}

async function incrementUsage(deps: ServiceDeps, billingAccountId: string, resource: string, amount: number) {
  assertNonNegativeFiniteAmount(amount, 'bytes');
  if (amount === 0) {
    return;
  }

  const timestamp = toIsoString(deps.now());
  const meterId = `${billingAccountId}:${resource}`;
  let updated = false;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const existing = await findUsageMeter(deps, billingAccountId, resource);

    if (!existing) {
      try {
        await deps.db.create({
          model: TABLES.usageMeters,
          data: {
            id: meterId,
            billingAccountId,
            resource,
            current: amount,
            updatedAt: timestamp
          } satisfies BillFnUsageMeter,
          namespace: deps.namespace
        });
        updated = true;
        break;
      } catch (error) {
        if (isDuplicateRecordError(error)) {
          await Promise.resolve();
          continue;
        }
        throw error;
      }
    }

    try {
      await deps.db.update({
        model: TABLES.usageMeters,
        where: [
          { field: 'id', operator: 'eq', value: existing.id },
          { field: 'current', operator: 'eq', value: existing.current }
        ],
        data: {
          ...existing,
          current: existing.current + amount,
          updatedAt: timestamp
        } satisfies BillFnUsageMeter,
        namespace: deps.namespace
      });
      updated = true;
      break;
    } catch (error) {
      if (isOptimisticUsageConflict(error)) {
        await Promise.resolve();
        continue;
      }
      throw error;
    }
  }

  if (!updated) {
    throw createBillFnError({
      code: 'BILLFN_CONFLICT',
      message: `Unable to update usage for ${resource} after multiple retries`
    });
  }

  const ledger: BillFnUsageLedgerEntry = {
    id: deps.generateId('ulg'),
    billingAccountId,
    resource,
    amount,
    createdAt: timestamp
  };
  await deps.db.create({
    model: TABLES.usageLedger,
    data: ledger,
    namespace: deps.namespace
  });
}

async function resolveProjectionContextForProviderState(
  deps: ServiceDeps,
  input: {
    provider: BillingProviderName;
    state: NonNullable<Awaited<ReturnType<NonNullable<BillFnProviderAdapter['verifyCheckout']>>>>;
    checkoutReferenceId?: string;
  }
) {
  const subscription = await findSubscriptionByProviderRef(
    deps,
    input.provider,
    input.state.providerSubscriptionId,
    input.state.providerChargeId,
    input.checkoutReferenceId
  );

  if (subscription) {
    const billingAccount = await getBillingAccountById(deps, subscription.billingAccountId);
    if (!billingAccount) {
      return null;
    }

    const plan = requirePlan(deps.catalog, subscription.planKey);
    const price = requirePriceById(plan, subscription.priceId);
    const checkoutSession = await findCheckoutSessionByProviderRef(
      deps,
      input.provider,
      input.state.providerSubscriptionId,
      input.state.providerChargeId,
      input.checkoutReferenceId
    );

    return {
      billingAccount,
      subscription,
      checkoutSession,
      plan,
      price
    };
  }

  const checkoutSession = await findCheckoutSessionByProviderRef(
    deps,
    input.provider,
    input.state.providerSubscriptionId,
    input.state.providerChargeId,
    input.checkoutReferenceId
  );

  if (!checkoutSession) {
    return null;
  }

  const billingAccount = await getBillingAccountById(deps, checkoutSession.billingAccountId);
  if (!billingAccount) {
    return null;
  }

  const plan = requirePlan(deps.catalog, checkoutSession.planKey);
  const price = requirePriceById(plan, checkoutSession.priceId);

  return {
    billingAccount,
    subscription: null,
    checkoutSession,
    plan,
    price
  };
}

async function processParsedWebhookEvent(
  deps: ServiceDeps,
  providerName: BillingProviderName,
  event: {
    providerEventId: string;
    type: string;
    signatureVerified: boolean;
    occurredAt?: string;
    planKey?: string;
    priceId?: string;
    providerSubscriptionId?: string;
    providerChargeId?: string;
    checkoutReferenceId?: string;
    billingState?: NonNullable<Awaited<ReturnType<NonNullable<BillFnProviderAdapter['verifyCheckout']>>>>;
    raw: Record<string, unknown>;
  }
) {
  if (!event.billingState) {
    return null;
  }
  const projection = await resolveProjectionContextForProviderState(deps, {
    provider: providerName,
    state: event.billingState,
    checkoutReferenceId: event.checkoutReferenceId
  });
  if (!projection) {
    throw createBillFnError({
      code: 'BILLFN_NOT_FOUND',
      message: `Webhook event could not be linked to a billing account: ${event.providerEventId}`
    });
  }
  return applyVerificationState(deps, {
    billingAccount: projection.billingAccount,
    plan: projection.plan,
    price: projection.price,
    checkoutSession: projection.checkoutSession ?? undefined,
    subscription: projection.subscription ?? undefined,
    state: event.billingState
  });
}

function jobToQueuePayload(job: BillFnReconciliationJob): BillFnQueuedJob {
  switch (job.kind) {
    case 'webhook-event':
      return {
        type: 'webhook-event',
        jobId: job.id,
        provider: job.provider as BillingProviderName,
        providerEventId: job.providerEventId as string
      };
    case 'subscription-sync':
      return {
        type: 'subscription-sync',
        jobId: job.id,
        provider: job.provider as BillingProviderName,
        subscriptionId: job.subscriptionId as string
      };
    case 'account-scan':
      return {
        type: 'account-scan',
        jobId: job.id,
        provider: job.provider,
        billingAccountId: job.billingAccountId as string
      };
    case 'notification-history-backfill':
      return {
        type: 'notification-history-backfill',
        jobId: job.id,
        provider: job.provider as BillingProviderName,
        cursor: job.cursor
      };
    case 'webhook-replay':
      return {
        type: 'webhook-replay',
        jobId: job.id,
        provider: job.provider as BillingProviderName,
        providerEventId: job.providerEventId as string
      };
  }
}

function buildWebhookReceiptId(provider: BillingProviderName, providerEventId: string) {
  return `whr_${provider}_${Buffer.from(providerEventId).toString('base64url')}`;
}

function serializeParsedWebhookEvent(event: {
  providerEventId: string;
  type: string;
  signatureVerified: boolean;
  occurredAt?: string;
  planKey?: string;
  priceId?: string;
  providerSubscriptionId?: string;
  providerChargeId?: string;
  checkoutReferenceId?: string;
  billingState?: NonNullable<Awaited<ReturnType<NonNullable<BillFnProviderAdapter['verifyCheckout']>>>>;
  raw: Record<string, unknown>;
}) {
  return {
    providerEventId: event.providerEventId,
    type: event.type,
    signatureVerified: event.signatureVerified,
    occurredAt: event.occurredAt,
    planKey: event.planKey,
    priceId: event.priceId,
    providerSubscriptionId: event.providerSubscriptionId,
    providerChargeId: event.providerChargeId,
    checkoutReferenceId: event.checkoutReferenceId,
    billingState: event.billingState,
    raw: event.raw
  };
}

function deserializeParsedWebhookEvent(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    providerEventId: readString(record, 'providerEventId') ?? 'unknown',
    type: readString(record, 'type') ?? 'unknown',
    signatureVerified: record.signatureVerified === true,
    occurredAt: readString(record, 'occurredAt') ?? undefined,
    planKey: readString(record, 'planKey') ?? undefined,
    priceId: readString(record, 'priceId') ?? undefined,
    providerSubscriptionId: readString(record, 'providerSubscriptionId') ?? undefined,
    providerChargeId: readString(record, 'providerChargeId') ?? undefined,
    checkoutReferenceId: readString(record, 'checkoutReferenceId') ?? undefined,
    billingState: asRecord(record.billingState) as unknown as NonNullable<
      Awaited<ReturnType<NonNullable<BillFnProviderAdapter['verifyCheckout']>>>
    > | undefined,
    raw: asRecord(record.raw) ?? {}
  };
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function assertNonNegativeFiniteAmount(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: `${fieldName} must be a non-negative finite number`
    });
  }
}

function isDuplicateRecordError(error: unknown) {
  return error instanceof DuplicateKeyError || (error instanceof Error && error.message.includes('UNIQUE constraint failed'));
}

function isOptimisticUsageConflict(error: unknown) {
  return (
    error instanceof NotFoundError ||
    (error instanceof Error && 'code' in error && (error as { code?: string }).code === AdapterErrorCode.NOT_FOUND)
  );
}

function isBillFnNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'BILLFN_NOT_FOUND'
  );
}

function mergeJson(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!existing && !incoming) {
    return undefined;
  }
  return {
    ...(existing ?? {}),
    ...(incoming ?? {})
  };
}
