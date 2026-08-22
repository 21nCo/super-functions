import type {
  BillableSubject,
  BillFnInstance,
  BillFnPlanDefinition,
  BillingProviderName,
} from "@billfn/core";
import {
  AdminError,
  adminPageIdentity,
  decodeAdminCursor,
  encodeAdminCursor,
  normalizeAdminPageLimit,
  type AdminOperationContext,
  type AdminOperationResult,
} from "@superfunctions/admin";
import type { BillFnAdminListInput, BillFnAdminService } from "./index.js";

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

function compareAdminValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function list(
  values: object[],
  input: BillFnAdminListInput,
  context: AdminOperationContext,
  operationId: string,
): AdminOperationResult<JsonRecord> {
  let records = values.map(asJson);
  if (input.search?.trim()) {
    const query = input.search.trim().toLowerCase();
    records = records.filter((value) => JSON.stringify(value).toLowerCase().includes(query));
  }
  if (input.filter) {
    records = records.filter((value) => Object.entries(input.filter!).every(([key, expected]) => Object.is(value[key], expected)));
  }
  const sorts = input.sort ?? [];
  records.sort((left, right) => {
    for (const descriptor of sorts) {
      if (!descriptor.field) continue;
      const compared = compareAdminValues(left[descriptor.field], right[descriptor.field]);
      if (compared !== 0) return compared * (descriptor.direction === "desc" ? -1 : 1);
    }
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const identity = adminPageIdentity(
    operationId,
    input.search?.trim().toLowerCase(),
    input.filter,
    input.sort ?? [],
  );
  const decoded = input.cursor
    ? decodeAdminCursor<{ identity?: unknown; offset?: unknown }>(input.cursor, context.scope)
    : { identity, offset: 0 };
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new AdminError("invalid_argument", "The BillFn cursor is invalid.");
  }
  if (decoded.identity !== identity) {
    throw new AdminError("invalid_argument", "The BillFn cursor does not belong to this collection query.");
  }
  const offset = decoded.offset ?? 0;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) throw new AdminError("invalid_argument", "The BillFn cursor is invalid.");
  const limit = normalizeAdminPageLimit(input.limit, { defaultLimit: 50, maxLimit: 200 });
  const items = records.slice(offset as number, (offset as number) + limit);
  const nextOffset = (offset as number) + items.length;
  return { ok: true, data: { items, nextCursor: nextOffset < records.length ? encodeAdminCursor(context.scope, { identity, offset: nextOffset }) : null } };
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
    async listProducts(input, context) {
      const catalog = await options.billfn.getCatalog();
      return list(products(catalog.plans), input, context, "billfn.products.list");
    },
    async getProduct(input) {
      const catalog = await options.billfn.getCatalog();
      const value = products(catalog.plans).find((entry) => (entry as { id: string }).id === input.id);
      return value ? item(value) : notFound("Product");
    },
    async listPlans(input, context) {
      const catalog = await options.billfn.getCatalog();
      const plans = catalog.plans.map((plan) => ({ ...plan, id: plan.planKey }));
      return list(plans, input, context, "billfn.plans.list");
    },
    async getPlan(input) {
      const catalog = await options.billfn.getCatalog();
      const value = catalog.plans.map((plan) => ({ ...plan, id: plan.planKey })).find((entry) => entry.id === input.id);
      return value ? item(value) : notFound("Plan");
    },
    async listPrices(input, context) {
      const catalog = await options.billfn.getCatalog();
      return list(catalog.plans.flatMap((plan) => plan.prices.map((price) => ({ ...price, id: price.priceId, planKey: plan.planKey, productKey: plan.productKey }))), input, context, "billfn.prices.list");
    },
    async getPrice(input) {
      const catalog = await options.billfn.getCatalog();
      const value = catalog.plans.flatMap((plan) => plan.prices.map((price) => ({ ...price, id: price.priceId, planKey: plan.planKey, productKey: plan.productKey }))).find((entry) => entry.id === input.id);
      return value ? item(value) : notFound("Price");
    },
    async listSubscriptions(input, context) {
      const subject = await options.subject(context);
      const subscription = await options.billfn.subscriptionProvider.getActiveSubscription(subject);
      return list(subscription ? [subscription] : [], input, context, "billfn.subscriptions.list");
    },
    async getSubscription(input, context) {
      const subject = await options.subject(context);
      const subscription = await options.billfn.subscriptionProvider.getActiveSubscription(subject);
      return subscription?.id === input.id ? item(subscription) : notFound("Subscription");
    },
    async listEntitlements(input, context) {
      const data = unwrap(await options.billfn.getEntitlements(await options.subject(context)));
      return list(data.entitlements ? [data.entitlements] : [], input, context, "billfn.entitlements.list");
    },
    async getEntitlement(input, context) {
      const data = unwrap(await options.billfn.getEntitlements(await options.subject(context)));
      return data.entitlements?.id === input.id ? item(data.entitlements) : notFound("Entitlement");
    },
    async listUsage(input, context) {
      const data = unwrap(await options.billfn.getUsage(await options.subject(context), optionalString(input.filter?.resource, "filter.resource")));
      return list(data.usage.map((entry) => ({ ...entry, id: entry.resource })), input, context, "billfn.usage.list");
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
