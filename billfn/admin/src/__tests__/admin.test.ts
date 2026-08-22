import { describe, expect, it, vi } from "vitest";
import {
  billFnAdminCapability,
  createBillFnAdminAdapter,
  createBillFnDomainAdminService,
  type BillFnAdminService,
} from "../index.js";
import { createBillFn, type BillFnInstance } from "@billfn/core";
import { memoryAdapter } from "@superfunctions/db/adapters";

const context = {
  scope: {
    organizationId: "org_1",
    workspaceId: "workspace_1",
    projectId: "project_1",
    environmentId: "environment_1",
    namespace: "tenant_1",
    region: "in-south",
  },
  actor: { id: "operator_1", type: "user" as const, permissions: ["*"] },
  requestId: "request_1",
  correlationId: "correlation_1",
  source: "console" as const,
  idempotencyKey: "idempotency_1",
};

describe("@billfn/admin", () => {
  it("declares the inventoried operator surface and mutation policy", () => {
    expect(billFnAdminCapability.schemaVersion).toBe("1.0");
    expect(billFnAdminCapability.availability).toBe("required-product");
    expect(billFnAdminCapability.scopeLevels).toEqual([
      "organization",
      "workspace",
      "project",
      "environment",
    ]);
    expect(
      billFnAdminCapability.operations.some(
        (operation) => operation.id === "billfn.plans.list",
      ),
    ).toBe(true);
    const mutation = billFnAdminCapability.operations.find(
      (operation) => operation.safety.classification !== "read",
    );
    expect(mutation).toMatchObject({
      safety: {
        audit: "required",
        idempotent: true,
      },
    });
  });

  it("delegates the operation and complete scope to the injected domain service", async () => {
    const listPlans = vi.fn(async (_input, operationContext) => ({
      ok: true as const,
      data: {
        operationId: "billfn.plans.list",
        namespace: operationContext.scope.namespace,
        region: operationContext.scope.region,
      },
    }));
    const unused = vi.fn(async () => ({ ok: true as const, data: {} }));
    const service: BillFnAdminService = {
      listProducts: unused,
      getProduct: unused,
      listPlans,
      getPlan: unused,
      listPrices: unused,
      getPrice: unused,
      listSubscriptions: unused,
      getSubscription: unused,
      listEntitlements: unused,
      getEntitlement: unused,
      listUsage: unused,
      getUsage: unused,
      changeSubscription: unused,
      cancelSubscription: unused,
      refundPayment: unused,
      reconcileProvider: unused,
    };
    const adapter = createBillFnAdminAdapter(service);

    const result = await adapter.execute(
      "billfn.plans.list",
      { limit: 25 },
      context,
    );

    expect(result.data).toEqual({
      operationId: "billfn.plans.list",
      namespace: "tenant_1",
      region: "in-south",
    });
    expect(listPlans).toHaveBeenCalledWith({ limit: 25 }, context);
    expect(unused).not.toHaveBeenCalled();
  });

  it("reads the configured catalog through a real BillFn instance", async () => {
    const billfn = createBillFn({
      db: memoryAdapter(),
      catalog: {
        plans: [{
          productKey: "superconsole",
          planKey: "pro",
          displayName: "Pro",
          features: { audit: true },
          limits: { projects: 25 },
          prices: [{
            priceId: "price_monthly",
            provider: "stripe",
            providerProductId: "prod_superconsole",
            currency: "USD",
            amount: 2900,
            kind: "subscription",
            interval: "month",
          }],
        }],
      },
    });
    const adapter = createBillFnAdminAdapter(
      createBillFnDomainAdminService({
        billfn,
        subject: (admin) => ({ tenantId: admin.scope.workspaceId }),
      }),
    );

    await expect(adapter.execute("billfn.plans.list", {}, context)).resolves.toMatchObject({
      data: { items: [{ id: "pro", productKey: "superconsole" }] },
    });
    await expect(adapter.execute("billfn.prices.get", { id: "price_monthly" }, context)).resolves.toMatchObject({
      data: { item: { planKey: "pro", amount: 2900 } },
    });
  });

  it("applies declared catalog list search, filters, sorting, limits, and cursors", async () => {
    const plans = ["gamma", "alpha", "beta"].map((planKey) => ({
      productKey: "console",
      planKey,
      displayName: `${planKey} plan`,
      features: {},
      limits: {},
      prices: [],
    }));
    const service = createBillFnDomainAdminService({
      billfn: { getCatalog: vi.fn(async () => ({ plans })) } as unknown as BillFnInstance,
      subject: () => ({ tenantId: "tenant_1" }),
    });
    const first = await service.listPlans({ search: "plan", sort: [{ field: "id", direction: "asc" }], limit: 2 }, context);
    expect(first.data).toMatchObject({ items: [{ id: "alpha" }, { id: "beta" }], nextCursor: expect.any(String) });
    const second = await service.listPlans({
      filter: { productKey: "console" },
      sort: [{ field: "id", direction: "asc" }],
      limit: 2,
      cursor: (first.data as { nextCursor: string }).nextCursor,
    }, context);
    expect(second.data).toEqual({ items: [expect.objectContaining({ id: "gamma" })], nextCursor: null });
  });

  it("derives reconciliation targets from the active subject and rejects foreign targets/providers", async () => {
    const enqueueReconciliationJob = vi.fn(async (input) => ({
      ok: true as const,
      data: { jobId: "reconcile_1", ...input },
    }));
    const billfn = {
      getEntitlements: vi.fn(async () => ({
        ok: true as const,
        data: {
          billingAccount: { id: "account_owned" },
          subscription: { id: "subscription_owned" },
        },
      })),
      enqueueReconciliationJob,
    } as unknown as BillFnInstance;
    const service = createBillFnDomainAdminService({
      billfn,
      subject: () => ({ tenantId: "tenant_owned" }),
    });

    await expect(service.reconcileProvider({
      payload: { kind: "account-scan", billingAccountId: "account_foreign" },
    }, context)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.reconcileProvider({
      payload: { kind: "account-scan", provider: "not-a-provider" as never },
    }, context)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.reconcileProvider({
      payload: { kind: "subscription-sync", subscriptionId: "subscription_foreign" },
    }, context)).rejects.toMatchObject({ code: "forbidden" });

    await expect(service.reconcileProvider({
      payload: { kind: "subscription-sync", provider: "stripe" },
    }, context)).resolves.toMatchObject({ data: { accepted: true } });
    expect(enqueueReconciliationJob).toHaveBeenCalledTimes(1);
    expect(enqueueReconciliationJob).toHaveBeenCalledWith({
      kind: "subscription-sync",
      provider: "stripe",
      billingAccountId: "account_owned",
      subscriptionId: "subscription_owned",
    });
  });
});
