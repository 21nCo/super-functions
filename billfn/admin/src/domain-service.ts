import type {
  BillableSubject,
  BillFnInstance,
  BillFnPlanDefinition,
  BillingProviderName,
} from "@billfn/core";
import {
  AdminError,
  type AdminOperationContext,
  type AdminOperationResult,
} from "@superfunctions/admin";
import type { BillFnAdminService } from "./index.js";

type JsonRecord = Record<string, unknown>;

export interface BillFnDomainAdminServiceOptions {
  billfn: BillFnInstance;
  /** Resolves the billable subject only after Super Console scope authorization. */
  subject(context: AdminOperationContext): BillableSubject | Promise<BillableSubject>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminError("invalid_argument", `${name} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : string(value, name);
}

function unwrap<T>(value: { ok: true; data: T } | { ok: false; error: { code: string; message: string; status: number; retryable: boolean; details?: unknown } }): T {
  if (value.ok) return value.data;
  const code = value.error.status === 404
    ? "not_found"
    : value.error.status === 403
      ? "forbidden"
      : value.error.status === 409
        ? "conflict"
        : value.error.status >= 500
          ? "dependency_unavailable"
          : "invalid_argument";
  throw new AdminError(code, value.error.message, {
    details: value.error.details,
    retryable: value.error.retryable,
  });
}

function asJson(value: object): JsonRecord {
  return { ...value };
}

function list(values: object[]): AdminOperationResult<JsonRecord> {
  return { ok: true, data: { items: values.map(asJson), nextCursor: null } };
}

function item(value: object): AdminOperationResult<JsonRecord> {
  return { ok: true, data: { item: asJson(value) } };
}

function accepted(value: object): AdminOperationResult<JsonRecord> {
  return { ok: true, data: { accepted: true, item: asJson(value) } };
}

function notFound(label: string): never {
  throw new AdminError("not_found", `${label} was not found for the active BillFn subject.`);
}

const BILLING_PROVIDERS = new Set<BillingProviderName>([
  "dodo",
  "apple",
  "stripe",
  "polar",
  "google-play",
  "microsoft-store",
]);

function billingProvider(value: string | undefined): BillingProviderName | undefined {
  if (value === undefined) return undefined;
  if (!BILLING_PROVIDERS.has(value as BillingProviderName)) {
    throw new AdminError("invalid_argument", "provider must be a configured BillFn provider name.");
  }
  return value as BillingProviderName;
}

function products(plans: BillFnPlanDefinition[]): object[] {
  const grouped = new Map<string, { id: string; productKey: string; planCount: number }>();
  for (const plan of plans) {
    const existing = grouped.get(plan.productKey);
    grouped.set(plan.productKey, {
      id: plan.productKey,
      productKey: plan.productKey,
      planCount: (existing?.planCount ?? 0) + 1,
    });
  }
  return [...grouped.values()];
}

/** Delegates billing changes to BillFn so provider, catalog, entitlement and reconciliation invariants remain active. */
export function createBillFnDomainAdminService(
  options: BillFnDomainAdminServiceOptions,
): BillFnAdminService {
  return {
    async listProducts() {
      const catalog = await options.billfn.getCatalog();
      return list(products(catalog.plans));
    },
    async getProduct(input) {
      const catalog = await options.billfn.getCatalog();
      const value = products(catalog.plans).find((entry) => (entry as { id: string }).id === input.id);
      return value ? item(value) : notFound("Product");
    },
    async listPlans() {
      const catalog = await options.billfn.getCatalog();
      const plans = catalog.plans.map((plan) => ({ ...plan, id: plan.planKey }));
      return list(plans);
    },
    async getPlan(input) {
      const catalog = await options.billfn.getCatalog();
      const value = catalog.plans.map((plan) => ({ ...plan, id: plan.planKey })).find((entry) => entry.id === input.id);
      return value ? item(value) : notFound("Plan");
    },
    async listPrices() {
      const catalog = await options.billfn.getCatalog();
      return list(catalog.plans.flatMap((plan) => plan.prices.map((price) => ({ ...price, id: price.priceId, planKey: plan.planKey, productKey: plan.productKey }))));
    },
    async getPrice(input) {
      const catalog = await options.billfn.getCatalog();
      const value = catalog.plans.flatMap((plan) => plan.prices.map((price) => ({ ...price, id: price.priceId, planKey: plan.planKey, productKey: plan.productKey }))).find((entry) => entry.id === input.id);
      return value ? item(value) : notFound("Price");
    },
    async listSubscriptions(_input, context) {
      const subject = await options.subject(context);
      const subscription = await options.billfn.subscriptionProvider.getActiveSubscription(subject);
      return list(subscription ? [subscription] : []);
    },
    async getSubscription(input, context) {
      const subject = await options.subject(context);
      const subscription = await options.billfn.subscriptionProvider.getActiveSubscription(subject);
      return subscription?.id === input.id ? item(subscription) : notFound("Subscription");
    },
    async listEntitlements(_input, context) {
      const data = unwrap(await options.billfn.getEntitlements(await options.subject(context)));
      return list(data.entitlements ? [data.entitlements] : []);
    },
    async getEntitlement(input, context) {
      const data = unwrap(await options.billfn.getEntitlements(await options.subject(context)));
      return data.entitlements?.id === input.id ? item(data.entitlements) : notFound("Entitlement");
    },
    async listUsage(input, context) {
      const data = unwrap(await options.billfn.getUsage(await options.subject(context), optionalString(input.filter?.resource, "filter.resource")));
      return list(data.usage.map((entry) => ({ ...entry, id: entry.resource })));
    },
    async getUsage(input, context) {
      const data = unwrap(await options.billfn.getUsage(await options.subject(context), input.id));
      const value = data.usage.find((entry) => entry.resource === input.id);
      return value ? item({ ...value, id: value.resource }) : notFound("Usage meter");
    },
    async changeSubscription(input, context) {
      return accepted(unwrap(await options.billfn.changeSubscription({
        subject: await options.subject(context),
        subscriptionId: input.id,
        targetPriceId: input.payload.targetPriceId,
        effectiveAt: input.payload.effectiveAt,
        prorationBehavior: input.payload.prorationBehavior,
        reason: input.reason,
      })));
    },
    async cancelSubscription(input, context) {
      return accepted(unwrap(await options.billfn.cancelSubscription({
        subject: await options.subject(context),
        subscriptionId: input.id,
        reason: input.reason,
      })));
    },
    async refundPayment(input, context) {
      return accepted(unwrap(await options.billfn.refundCharge({
        subject: await options.subject(context),
        providerChargeId: input.id,
        subscriptionId: input.payload?.subscriptionId,
        mode: input.payload?.mode,
        amount: input.payload?.amount,
        reason: input.reason,
      })));
    },
    async reconcileProvider(input, context) {
      const subject = await options.subject(context);
      const scoped = unwrap(await options.billfn.getEntitlements(subject));
      if (input.payload.billingAccountId !== undefined && input.payload.billingAccountId !== scoped.billingAccount.id) {
        throw new AdminError("forbidden", "The reconciliation billing account is outside the active BillFn subject.");
      }

      if (input.payload.kind !== "account-scan" && input.payload.kind !== "subscription-sync") {
        throw new AdminError(
          "forbidden",
          "Provider-wide reconciliation jobs cannot be scheduled from a subject-scoped admin operation.",
        );
      }

      const subscriptionId = input.payload.kind === "subscription-sync"
        ? scoped.subscription?.id
        : undefined;
      if (input.payload.kind === "subscription-sync" && !subscriptionId) {
        throw new AdminError("precondition_failed", "The active BillFn subject has no subscription to reconcile.");
      }
      if (input.payload.subscriptionId !== undefined && input.payload.subscriptionId !== subscriptionId) {
        throw new AdminError("forbidden", "The reconciliation subscription is outside the active BillFn subject.");
      }

      return accepted(unwrap(await options.billfn.enqueueReconciliationJob({
        kind: input.payload.kind,
        provider: billingProvider(input.payload.provider),
        billingAccountId: scoped.billingAccount.id,
        subscriptionId,
      })));
    },
  };
}
