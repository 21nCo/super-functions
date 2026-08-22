import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  createCapabilityAdminClient,
  defineAdminCapability,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminCapabilityAdapter,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
  type AdminOperationResult,
} from "@superfunctions/admin";

export interface BillFnAdminResourceDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  risk: "standard" | "sensitive";
  idField: string;
  displayFields: readonly string[];
  searchableFields: readonly string[];
  filterableFields: readonly string[];
  sortableFields: readonly string[];
  sensitiveFields: readonly string[];
}

export interface BillFnAdminActionDefinition {
  id: string;
  resource: string;
  title: string;
  description: string;
  classification: "write" | "destructive";
  requiresConfirmation: boolean;
  idempotent: true;
  target: "resource" | "collection";
}

export const billFnAdminResources = [
  {
    id: "customers",
    label: "Customers",
    description: "Inspect and operate customers in BillFn.",
    icon: "billfn:customers",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "products",
    label: "Products",
    description: "Inspect and operate products in BillFn.",
    icon: "billfn:products",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "productKey", "planCount"],
    searchableFields: ["id", "productKey"],
    filterableFields: ["productKey", "planCount"],
    sortableFields: ["productKey", "planCount"],
    sensitiveFields: [],
  },
  {
    id: "plans",
    label: "Plans",
    description: "Inspect and operate plans in BillFn.",
    icon: "billfn:plans",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "displayName", "productKey", "planKey"],
    searchableFields: ["id", "displayName", "productKey", "planKey"],
    filterableFields: ["productKey", "planKey"],
    sortableFields: ["displayName", "productKey", "planKey"],
    sensitiveFields: [],
  },
  {
    id: "prices",
    label: "Prices",
    description: "Inspect and operate prices in BillFn.",
    icon: "billfn:prices",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "displayName", "amount", "currency", "interval", "provider"],
    searchableFields: ["id", "displayName", "priceId", "planKey", "productKey", "provider"],
    filterableFields: ["provider", "currency", "kind", "interval", "planKey", "productKey"],
    sortableFields: ["amount", "currency", "displayName", "interval", "provider"],
    sensitiveFields: [],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    description: "Inspect and operate subscriptions in BillFn.",
    icon: "billfn:subscriptions",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "planKey", "status", "provider", "currentPeriodEnd", "updatedAt"],
    searchableFields: ["id", "planKey", "priceId", "provider", "status"],
    filterableFields: ["planKey", "provider", "status"],
    sortableFields: ["createdAt", "currentPeriodEnd", "status", "updatedAt"],
    sensitiveFields: [],
  },
  {
    id: "entitlements",
    label: "Entitlements",
    description: "Inspect and operate entitlements in BillFn.",
    icon: "billfn:entitlements",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "planKey", "status", "effectiveAt", "expiresAt", "updatedAt"],
    searchableFields: ["id", "planKey", "status"],
    filterableFields: ["planKey", "status"],
    sortableFields: ["createdAt", "effectiveAt", "expiresAt", "updatedAt"],
    sensitiveFields: [],
  },
  {
    id: "quotas",
    label: "Quotas",
    description: "Inspect and operate quotas in BillFn.",
    icon: "billfn:quotas",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "invoices",
    label: "Invoices",
    description: "Inspect and operate invoices in BillFn.",
    icon: "billfn:invoices",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "payments",
    label: "Payments",
    description: "Inspect and operate payments in BillFn.",
    icon: "billfn:payments",
    risk: "sensitive",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [
      "secret",
      "token",
      "credential",
      "value",
      "password",
      "passwd",
      "apiKey",
      "privateKey",
      "authorization",
      "cookie",
      "otp",
      "otpCode",
      "recoveryCode",
      "recoveryCodes",
      "verificationCode",
      "sessionToken",
    ],
  },
  {
    id: "usage",
    label: "Usage",
    description: "Inspect and operate usage in BillFn.",
    icon: "billfn:usage",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "resource", "current", "limit"],
    searchableFields: ["id", "resource"],
    filterableFields: ["resource"],
    sortableFields: ["current", "limit", "resource"],
    sensitiveFields: [],
  },
  {
    id: "reconciliation",
    label: "Reconciliation",
    description: "Inspect and operate reconciliation in BillFn.",
    icon: "billfn:reconciliation",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "revenue",
    label: "Revenue",
    description: "Inspect and operate revenue in BillFn.",
    icon: "billfn:revenue",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
] as const satisfies readonly BillFnAdminResourceDefinition[];

export const billFnAdminActions = [
  {
    id: "create-catalog",
    resource: "products",
    title: "Create Catalog",
    description: "Create Catalog for products.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "update-catalog",
    resource: "products",
    title: "Update Catalog",
    description: "Update Catalog for products.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "grant-entitlement",
    resource: "entitlements",
    title: "Grant Entitlement",
    description: "Grant Entitlement for entitlements.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "change-subscription",
    resource: "subscriptions",
    title: "Change Subscription",
    description: "Change Subscription for subscriptions.",
    classification: "write",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
  {
    id: "cancel-subscription",
    resource: "subscriptions",
    title: "Cancel Subscription",
    description: "Cancel Subscription for subscriptions.",
    classification: "destructive",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
  {
    id: "issue-credit",
    resource: "invoices",
    title: "Issue Credit",
    description: "Issue Credit for invoices.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "refund-payment",
    resource: "payments",
    title: "Refund Payment",
    description: "Refund Payment for payments.",
    classification: "write",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
  {
    id: "reconcile-provider",
    resource: "reconciliation",
    title: "Reconcile Provider",
    description: "Reconcile Provider for reconciliation.",
    classification: "write",
    requiresConfirmation: true,
    idempotent: true,
    target: "collection",
  },
] as const satisfies readonly BillFnAdminActionDefinition[];

export interface BillFnAdminResourcePolicy {
  defaultScope: "active";
  permission: string;
  redaction: "none" | "sensitive-fields";
}

export interface BillFnAdminOperationPolicy {
  permission: string;
  scope: {
    levels: readonly ["organization", "workspace", "project", "environment"];
    forwardsNamespace: true;
    forwardsRegion: true;
  };
  safety: {
    classification: "write" | "destructive";
    requiresConfirmation: boolean;
  };
  idempotency: {
    mode: "required";
    keyStrategy: "context.idempotencyKey";
  };
  audit: {
    mode: "required";
    action: string;
    targetResource: string;
    targetIdPath?: "$.id";
    collection?: true;
  };
  observation: {
    domain: "billfn";
    requestIdPath: "context.requestId";
    correlationIdPath: "context.correlationId";
  };
}

export const billFnAdminResourcePolicies = Object.freeze(
  Object.fromEntries(
    billFnAdminResources.map((resource) => [
      resource.id,
      {
        defaultScope: "active",
        permission: "billfn." + resource.id + ".read",
        redaction:
          resource.sensitiveFields.length > 0 ? "sensitive-fields" : "none",
      } satisfies BillFnAdminResourcePolicy,
    ]),
  ),
) as Readonly<Record<string, BillFnAdminResourcePolicy>>;

export const billFnAdminOperationPolicies = Object.freeze(
  Object.fromEntries(
    billFnAdminActions.map((action) => [
      "billfn." + action.resource + "." + action.id,
      {
        permission: "billfn." + action.resource + "." + action.id,
        scope: {
          levels: ["organization", "workspace", "project", "environment"],
          forwardsNamespace: true,
          forwardsRegion: true,
        },
        safety: {
          classification: action.classification,
          requiresConfirmation: action.requiresConfirmation,
        },
        idempotency: {
          mode: "required",
          keyStrategy: "context.idempotencyKey",
        },
        audit: {
          mode: "required",
          action: "billfn." + action.id,
          targetResource: action.resource,
          ...(action.target === "resource"
            ? { targetIdPath: "$.id" as const }
            : { collection: true as const }),
        },
        observation: {
          domain: "billfn",
          requestIdPath: "context.requestId",
          correlationIdPath: "context.correlationId",
        },
      } satisfies BillFnAdminOperationPolicy,
    ]),
  ),
) as Readonly<Record<string, BillFnAdminOperationPolicy>>;

const entitySchema: AdminObjectSchema = {
  type: "object",
  description:
    "A domain-owned administration resource. Sensitive fields are redacted by the domain service.",
  additionalProperties: true,
};

const listInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    cursor: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    search: { type: "string", maxLength: 500 },
    filter: { type: "object", additionalProperties: true },
    sort: {
      type: "array",
      items: { type: "object", additionalProperties: true },
      maxItems: 10,
    },
  },
  additionalProperties: false,
};

const listOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: entitySchema },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["items"],
  additionalProperties: false,
};

const getInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};

const getOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { item: entitySchema },
  required: ["item"],
  additionalProperties: false,
};

const actionInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    payload: { type: "object", additionalProperties: true },
    reason: { type: "string", minLength: 1, maxLength: 2000 },
  },
  additionalProperties: false,
};

const actionOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    item: entitySchema,
    accepted: { type: "boolean" },
    operationReference: { type: "string" },
  },
  required: ["accepted"],
  additionalProperties: true,
};
const payloadSchema = (
  properties: NonNullable<AdminObjectSchema["properties"]>,
  required: string[] = [],
): AdminObjectSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const domainActionInputSchemas: Record<string, AdminObjectSchema> = {
  "change-subscription": payloadSchema(
    {
      id: { type: "string", minLength: 1 },
      payload: payloadSchema(
        {
          targetPriceId: { type: "string", minLength: 1 },
          effectiveAt: { type: "string", enum: ["immediate", "next_renewal"] },
          prorationBehavior: { type: "string", enum: ["provider_default", "prorate", "none"] },
        },
        ["targetPriceId"],
      ),
      reason: { type: "string", minLength: 1, maxLength: 2000 },
    },
    ["id", "payload"],
  ),
  "cancel-subscription": payloadSchema(
    { id: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1, maxLength: 2000 } },
    ["id"],
  ),
  "refund-payment": payloadSchema(
    {
      id: { type: "string", minLength: 1 },
      payload: payloadSchema({
        subscriptionId: { type: "string", minLength: 1 },
        mode: { type: "string", enum: ["full", "prorated_remaining_period", "custom"] },
        amount: { type: "number", minimum: 0 },
      }),
      reason: { type: "string", minLength: 1, maxLength: 2000 },
    },
    ["id", "payload"],
  ),
  "reconcile-provider": payloadSchema(
    {
      payload: payloadSchema(
        {
          kind: { type: "string", enum: ["subscription-sync", "account-scan"] },
          provider: { type: "string", enum: ["dodo", "apple", "stripe", "polar", "google-play", "microsoft-store"] },
          billingAccountId: { type: "string", minLength: 1 },
          subscriptionId: { type: "string", minLength: 1 },
          providerEventId: { type: "string", minLength: 1 },
          cursor: { type: "string", minLength: 1 },
        },
        ["kind"],
      ),
    },
    ["payload"],
  ),
};

export const billFnAdminSchemas = {
  entity: entitySchema,
  listInput: listInputSchema,
  listOutput: listOutputSchema,
  getInput: getInputSchema,
  getOutput: getOutputSchema,
  actionInput: actionInputSchema,
  actionOutput: actionOutputSchema,
} as const satisfies Record<string, AdminJsonSchema>;

function resourceOperations(
  resource: BillFnAdminResourceDefinition,
): AdminOperationDefinition[] {
  const baseId = "billfn." + resource.id;
  const basePath = "/resources/" + resource.id;
  return [
    {
      id: baseId + ".list",
      title: "List " + resource.label,
      description:
        "List permitted " +
        resource.label.toLowerCase() +
        " in the active administration scope.",
      inputSchema: listInputSchema,
      outputSchema: listOutputSchema,
      route: { method: "GET", path: basePath },
      permission: "billfn." + resource.id + ".read",
      minimumScope: "workspace",
      safety: {
        classification: "read",
        idempotent: true,
        requiresConfirmation: false,
        audit: resource.risk === "sensitive" ? "required" : "optional",
      },
      pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 200 },
      mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      redaction: { outputFields: resource.sensitiveFields },
      target: { resource: resource.id, collection: true },
    },
    {
      id: baseId + ".get",
      title: "Get " + resource.label,
      description:
        "Get one permitted " + resource.label.toLowerCase() + " resource.",
      inputSchema: getInputSchema,
      outputSchema: getOutputSchema,
      route: { method: "GET", path: basePath + "/:id" },
      permission: "billfn." + resource.id + ".read",
      minimumScope: "workspace",
      safety: {
        classification: "read",
        idempotent: true,
        requiresConfirmation: false,
        audit: resource.risk === "sensitive" ? "required" : "optional",
      },
      mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      redaction: { outputFields: resource.sensitiveFields },
      target: { resource: resource.id, idInput: "id" },
    },
  ];
}

function actionOperation(
  action: BillFnAdminActionDefinition,
): AdminOperationDefinition {
  const sensitiveFields =
    billFnAdminResources.find((resource) => resource.id === action.resource)
      ?.sensitiveFields ?? [];
  return {
    id: "billfn." + action.resource + "." + action.id,
    title: action.title,
    description: action.description,
    inputSchema: domainActionInputSchemas[action.id] ?? (
      action.target === "resource"
        ? { ...actionInputSchema, required: ["id"] }
        : actionInputSchema
    ),
    outputSchema: actionOutputSchema,
    route: {
      method: "POST",
      path: "/resources/" + action.resource + "/actions/" + action.id,
    },
    permission: "billfn." + action.resource + "." + action.id,
    minimumScope: "workspace",
    safety: {
      classification: action.classification,
      idempotent: action.idempotent,
      requiresConfirmation: action.requiresConfirmation,
      ...(action.id === "refund-payment"
        ? {
            confirmation: {
              risk: "critical" as const,
              method: "mfa" as const,
              reason: "Refunds move money and require a recently verified operator.",
              maxAgeSeconds: 300,
            },
          }
        : action.id === "change-subscription"
          ? { confirmation: { risk: "high" as const, method: "recent-auth" as const, reason: "Changing a subscription updates externally billed recurring service.", maxAgeSeconds: 300 } }
          : action.id === "reconcile-provider"
            ? { confirmation: { risk: "high" as const, method: "explicit" as const, reason: "Provider reconciliation imports and persists external billing state.", maxAgeSeconds: 300 } }
            : action.id === "cancel-subscription"
              ? { confirmation: { risk: "critical" as const, method: "mfa" as const, reason: "Cancellation changes externally billed recurring service and access.", maxAgeSeconds: 300 } }
            : {}),
      audit: "required",
    },
    mcp: {
      readOnlyHint: false,
      destructiveHint: action.classification === "destructive",
      idempotentHint: action.idempotent,
    },
    redaction: { inputFields: sensitiveFields, outputFields: sensitiveFields },
    target:
      action.target === "resource"
        ? { resource: action.resource, idInput: "id" }
        : { resource: action.resource, collection: true },
  };
}

const domainReadResourceIds = new Set(["products", "plans", "prices", "subscriptions", "entitlements", "usage"]);
const domainResourceIds = new Set([...domainReadResourceIds, "payments", "reconciliation"]);
const domainActionIds = new Set(["change-subscription", "cancel-subscription", "refund-payment", "reconcile-provider"]);
const domainResources = billFnAdminResources.filter((resource) => domainResourceIds.has(resource.id));
const domainReadResources = domainResources.filter((resource) => domainReadResourceIds.has(resource.id));
const domainActions = billFnAdminActions.filter((action) => domainActionIds.has(action.id));
const operations: AdminOperationDefinition[] = [
  ...domainReadResources.flatMap(resourceOperations),
  ...domainActions.map(actionOperation),
];

type FunctionAdminActionOperationId<TModule extends string, TAction> =
  TAction extends { resource: infer TResource extends string; id: infer TActionId extends string }
    ? `${TModule}.${TResource}.${TActionId}`
    : never;

type BillFnDomainReadResourceId = "products" | "plans" | "prices" | "subscriptions" | "entitlements" | "usage";
type BillFnDomainAction = Extract<
  (typeof billFnAdminActions)[number],
  { id: "change-subscription" | "cancel-subscription" | "refund-payment" | "reconcile-provider" }
>;

export type BillFnAdminOperationId =
  | `billfn.${BillFnDomainReadResourceId}.list`
  | `billfn.${BillFnDomainReadResourceId}.get`
  | FunctionAdminActionOperationId<"billfn", BillFnDomainAction>;

export const billFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "billfn",
  displayName: "BillFn",
  version: "1.0.0",
  description:
    "Function-owned BillFn operator capabilities backed by the configured billing instance.",
  category: "commerce",
  availability: "required-product",
  scopeLevels: ["organization", "workspace", "project", "environment"],
  dependencies: [],
  resources: domainResources,
  navigation: [
    {
      id: "billfn",
      label: "BillFn",
      path: "/modules/billfn",
      icon: "billfn",
      description: "Operate BillFn in the active scope.",
      order: 100,
    },
  ],
  operations: operations as readonly (AdminOperationDefinition & { readonly id: BillFnAdminOperationId })[],
});

export interface BillFnAdminListInput {
  filter?: Record<string, unknown>;
  limit?: number;
  cursor?: string;
  search?: string;
  sort?: readonly { field?: string; direction?: "asc" | "desc" }[];
}
export interface BillFnAdminGetInput { id: string }
export interface BillFnChangeSubscriptionInput {
  id: string;
  payload: {
    targetPriceId: string;
    effectiveAt?: "immediate" | "next_renewal";
    prorationBehavior?: "provider_default" | "prorate" | "none";
  };
  reason?: string;
}
export interface BillFnCancelSubscriptionInput { id: string; reason?: string }
export interface BillFnRefundPaymentInput {
  id: string;
  payload: {
    subscriptionId?: string;
    mode?: "full" | "prorated_remaining_period" | "custom";
    amount?: number;
  };
  reason?: string;
}
export interface BillFnReconcileProviderInput {
  payload: {
    kind: "subscription-sync" | "account-scan";
    provider?: "dodo" | "apple" | "stripe" | "polar" | "google-play" | "microsoft-store";
    billingAccountId?: string;
    subscriptionId?: string;
    providerEventId?: string;
    cursor?: string;
  };
}
type BillFnAdminResult = AdminOperationResult<Record<string, unknown>>;

export function createBillFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(billFnAdminCapability, adminClient);
  const resource = (name: BillFnDomainReadResourceId) => ({
    list: (input: BillFnAdminListInput = {}, options?: AdminClientRequestOptions) => client.invoke(`billfn.${name}.list` as BillFnAdminOperationId, input, options),
    get: (input: BillFnAdminGetInput, options?: AdminClientRequestOptions) => client.invoke(`billfn.${name}.get` as BillFnAdminOperationId, input, options),
  });
  return Object.assign(client, {
    products: resource("products"),
    plans: resource("plans"),
    prices: resource("prices"),
    subscriptions: {
      ...resource("subscriptions"),
      change: (input: BillFnChangeSubscriptionInput, options?: AdminClientRequestOptions) => client.invoke("billfn.subscriptions.change-subscription", input, options),
      cancel: (input: BillFnCancelSubscriptionInput, options?: AdminClientRequestOptions) => client.invoke("billfn.subscriptions.cancel-subscription", input, options),
    },
    entitlements: resource("entitlements"),
    usage: resource("usage"),
    payments: {
      refund: (input: BillFnRefundPaymentInput, options?: AdminClientRequestOptions) => client.invoke("billfn.payments.refund-payment", input, options),
    },
    reconciliation: {
      run: (input: BillFnReconcileProviderInput, options?: AdminClientRequestOptions) => client.invoke("billfn.reconciliation.reconcile-provider", input, options),
    },
  });
}

export interface BillFnAdminService {
  listProducts(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getProduct(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  listPlans(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getPlan(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  listPrices(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getPrice(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  listSubscriptions(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getSubscription(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  listEntitlements(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getEntitlement(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  listUsage(input: BillFnAdminListInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  getUsage(input: BillFnAdminGetInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  changeSubscription(input: BillFnChangeSubscriptionInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  cancelSubscription(input: BillFnCancelSubscriptionInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  refundPayment(input: BillFnRefundPaymentInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
  reconcileProvider(input: BillFnReconcileProviderInput, context: AdminOperationContext): Promise<BillFnAdminResult>;
}

function bind<TInput>(handler: (input: TInput, context: AdminOperationContext) => Promise<BillFnAdminResult>) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

export function createBillFnAdminAdapter(
  service: BillFnAdminService,
): AdminCapabilityAdapter {
  return createKernelAdminCapabilityAdapter(billFnAdminCapability, {
    "billfn.products.list": bind(service.listProducts),
    "billfn.products.get": bind(service.getProduct),
    "billfn.plans.list": bind(service.listPlans),
    "billfn.plans.get": bind(service.getPlan),
    "billfn.prices.list": bind(service.listPrices),
    "billfn.prices.get": bind(service.getPrice),
    "billfn.subscriptions.list": bind(service.listSubscriptions),
    "billfn.subscriptions.get": bind(service.getSubscription),
    "billfn.entitlements.list": bind(service.listEntitlements),
    "billfn.entitlements.get": bind(service.getEntitlement),
    "billfn.usage.list": bind(service.listUsage),
    "billfn.usage.get": bind(service.getUsage),
    "billfn.subscriptions.change-subscription": bind(service.changeSubscription),
    "billfn.subscriptions.cancel-subscription": bind(service.cancelSubscription),
    "billfn.payments.refund-payment": bind(service.refundPayment),
    "billfn.reconciliation.reconcile-provider": bind(service.reconcileProvider),
  });
}

export const adminCapability = billFnAdminCapability;
export const createAdminAdapter = createBillFnAdminAdapter;
export {
  createBillFnDomainAdminService,
  type BillFnDomainAdminServiceOptions,
} from "./domain-service.js";
