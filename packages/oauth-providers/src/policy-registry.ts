import { randomUUID } from "node:crypto";
import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import { MemoryProviderPolicyAuditStore, MemoryProviderPolicyConsentStore } from "./stores.js";
import type { ProviderPolicyAuditStore, ProviderPolicyConsentStore } from "./stores.js";

export type OAuthProviderId = "google" | "microsoft" | "yahoo" | "apple" | "github";
export type ProviderFeatureMode = "metadata-only" | "snippet" | "full-body";

export interface ProviderCapabilityPolicy {
  supportsMailRead: boolean;
  supportsMailSend: boolean;
  supportsWatch: boolean;
  supportsRevoke: boolean;
  supportsManagedMailbox: boolean;
  allowedFeatureModes: ProviderFeatureMode[];
}

export interface ProviderAuthPolicy {
  supportsSocialLogin: boolean;
  supportsAccountLinking: boolean;
  defaultScopes: string[];
  availableClaims: Array<"email" | "name" | "profile">;
}

export type ProviderClientSecretMode = "static-allowed" | "resolver-allowed" | "resolver-required";

export interface ProviderRuntimePolicy {
  clientSecretMode: ProviderClientSecretMode;
  clientSecretResolverHint?: "apple-client-secret-jwt" | "runtime-client-secret";
}

export interface ProviderFeatureScopePolicy {
  allowedScopes: string[];
  restrictedScopes?: string[];
}

export interface ProviderOperationPolicy {
  allowed: boolean;
  reason?: string;
  requiredFeatureMode?: ProviderFeatureMode;
}

export interface ProviderPolicyDefinition {
  providerId: OAuthProviderId;
  policyVersion: string;
  descriptor: OAuthProviderDescriptor;
  capabilities: ProviderCapabilityPolicy;
  auth?: ProviderAuthPolicy;
  runtime?: ProviderRuntimePolicy;
  featureScopes: Record<string, ProviderFeatureScopePolicy>;
  operationPolicies: Record<string, ProviderOperationPolicy>;
}

export interface ScopeValidationInput {
  providerId: OAuthProviderId;
  feature: string;
  requestedScopes: string[];
  tenantId: string;
  userId: string;
  purpose: string;
}

export interface ScopeValidationResult {
  authorized: true;
  consentRecord: ConsentRecord;
}

export interface ConsentRecord {
  consentId: string;
  tenantId: string;
  userId: string;
  providerId: OAuthProviderId;
  feature: string;
  scopes: string[];
  purpose: string;
  grantedAt: string;
  policyVersion: string;
}

export interface OperationCheckInput {
  providerId: OAuthProviderId;
  operation: string;
  featureMode?: ProviderFeatureMode;
}

export interface OperationCheckResult {
  allowed: true;
  policyVersion: string;
}

export interface PolicyVersionUpdateInput {
  providerId: OAuthProviderId;
  newVersion: string;
  actor: string;
  reason: string;
  changedAt?: string;
}

export interface PolicyAuditEvent {
  auditEventId: string;
  providerId: OAuthProviderId;
  fromVersion: string;
  toVersion: string;
  actor: string;
  reason: string;
  changedAt: string;
}

export type ProviderPolicyIdKind = "consent" | "audit";
export type ProviderPolicyIdGenerator = (kind: ProviderPolicyIdKind) => string;

export interface ProviderPolicyRegistryOptions {
  consentStore?: ProviderPolicyConsentStore;
  auditStore?: ProviderPolicyAuditStore;
  idGenerator?: ProviderPolicyIdGenerator;
  now?: () => string;
}

export class ProviderPolicyError extends Error {
  readonly code:
    | "OAUTH_SCOPE_DISALLOWED"
    | "PROVIDER_POLICY_BLOCKED"
    | "PROVIDER_POLICY_STORE_FAILED"
    | "VALIDATION_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code:
      | "OAUTH_SCOPE_DISALLOWED"
      | "PROVIDER_POLICY_BLOCKED"
      | "PROVIDER_POLICY_STORE_FAILED"
      | "VALIDATION_ERROR",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ProviderPolicyError";
    this.code = code;
    this.details = details;
  }
}

export class ProviderPolicyRegistry {
  private readonly policies = new Map<OAuthProviderId, ProviderPolicyDefinition>();
  private readonly consentStore: ProviderPolicyConsentStore;
  private readonly auditStore: ProviderPolicyAuditStore;
  private readonly now: () => string;
  private readonly idGenerator: ProviderPolicyIdGenerator;

  constructor(policies: ReadonlyArray<ProviderPolicyDefinition>, options: ProviderPolicyRegistryOptions = {}) {
    for (const policy of policies) {
      this.policies.set(policy.providerId, clonePolicy(policy));
    }

    this.consentStore = options.consentStore ?? new MemoryProviderPolicyConsentStore();
    this.auditStore = options.auditStore ?? new MemoryProviderPolicyAuditStore();
    this.now = options.now ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultProviderPolicyIdGenerator;
  }

  getPolicy(providerId: OAuthProviderId): ProviderPolicyDefinition {
    const policy = this.policies.get(providerId);
    if (!policy) {
      throw new ProviderPolicyError("VALIDATION_ERROR", `provider policy not found: ${providerId}`);
    }

    return clonePolicy(policy);
  }

  listPolicies(): ProviderPolicyDefinition[] {
    return [...this.policies.values()].map((policy) => clonePolicy(policy));
  }

  async validateScopes(input: ScopeValidationInput): Promise<ScopeValidationResult> {
    const policy = this.getPolicy(input.providerId);
    const featurePolicy = policy.featureScopes[input.feature];
    if (!featurePolicy) {
      throw new ProviderPolicyError("VALIDATION_ERROR", "feature scope policy not found", {
        providerId: input.providerId,
        feature: input.feature
      });
    }

    const disallowedScope = input.requestedScopes.find((scope) => !featurePolicy.allowedScopes.includes(scope));
    if (disallowedScope) {
      throw new ProviderPolicyError("OAUTH_SCOPE_DISALLOWED", "requested scope not allowed for feature", {
        providerId: input.providerId,
        feature: input.feature,
        scope: disallowedScope
      });
    }

    const restrictedScope = input.requestedScopes.find((scope) => featurePolicy.restrictedScopes?.includes(scope));
    if (restrictedScope) {
      throw new ProviderPolicyError("OAUTH_SCOPE_DISALLOWED", "requested scope requires additional approval", {
        providerId: input.providerId,
        feature: input.feature,
        scope: restrictedScope
      });
    }

    const consentRecord: ConsentRecord = {
      consentId: this.idGenerator("consent"),
      tenantId: input.tenantId,
      userId: input.userId,
      providerId: input.providerId,
      feature: input.feature,
      scopes: [...input.requestedScopes],
      purpose: input.purpose,
      grantedAt: this.now(),
      policyVersion: policy.policyVersion
    };

    try {
      await this.consentStore.put(consentRecord);
    } catch (error) {
      throw new ProviderPolicyError(
        "PROVIDER_POLICY_STORE_FAILED",
        "failed to persist provider policy consent record",
        {
          providerId: input.providerId,
          feature: input.feature,
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }

    return {
      authorized: true,
      consentRecord: cloneConsent(consentRecord)
    };
  }

  assertOperationAllowed(input: OperationCheckInput): OperationCheckResult {
    const policy = this.getPolicy(input.providerId);
    const operationPolicy = policy.operationPolicies[input.operation];
    if (!operationPolicy || !operationPolicy.allowed) {
      throw new ProviderPolicyError("PROVIDER_POLICY_BLOCKED", "operation not allowed by policy", {
        providerId: input.providerId,
        operation: input.operation,
        policyVersion: policy.policyVersion
      });
    }

    if (operationPolicy.requiredFeatureMode && input.featureMode !== operationPolicy.requiredFeatureMode) {
      throw new ProviderPolicyError("PROVIDER_POLICY_BLOCKED", "operation not allowed by policy", {
        providerId: input.providerId,
        operation: input.operation,
        policyVersion: policy.policyVersion,
        requiredFeatureMode: operationPolicy.requiredFeatureMode,
        featureMode: input.featureMode
      });
    }

    return {
      allowed: true,
      policyVersion: policy.policyVersion
    };
  }

  async recordPolicyVersionUpdate(input: PolicyVersionUpdateInput): Promise<PolicyAuditEvent> {
    const currentPolicy = this.policies.get(input.providerId);
    if (!currentPolicy) {
      throw new ProviderPolicyError("VALIDATION_ERROR", `provider policy not found: ${input.providerId}`);
    }

    const changedAt = input.changedAt ?? this.now();
    const updated: ProviderPolicyDefinition = {
      ...currentPolicy,
      policyVersion: input.newVersion
    };
    const auditEvent: PolicyAuditEvent = {
      auditEventId: this.idGenerator("audit"),
      providerId: input.providerId,
      fromVersion: currentPolicy.policyVersion,
      toVersion: input.newVersion,
      actor: input.actor,
      reason: input.reason,
      changedAt
    };

    try {
      await this.auditStore.put(auditEvent);
    } catch (error) {
      throw new ProviderPolicyError(
        "PROVIDER_POLICY_STORE_FAILED",
        "failed to persist provider policy audit event",
        {
          providerId: input.providerId,
          fromVersion: currentPolicy.policyVersion,
          toVersion: input.newVersion,
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }

    this.policies.set(input.providerId, updated);
    return cloneAuditEvent(auditEvent);
  }

  async getConsentRecords(): Promise<ConsentRecord[]> {
    const records = await this.consentStore.list();
    return records.map((record) => cloneConsent(record));
  }

  async getPolicyAuditEvents(): Promise<PolicyAuditEvent[]> {
    const events = await this.auditStore.list();
    return events.map((event) => cloneAuditEvent(event));
  }
}

function defaultProviderPolicyIdGenerator(kind: ProviderPolicyIdKind): string {
  return `${kind}_${randomUUID()}`;
}

export function clonePolicy(policy: ProviderPolicyDefinition): ProviderPolicyDefinition {
  return {
    providerId: policy.providerId,
    policyVersion: policy.policyVersion,
    descriptor: {
      ...policy.descriptor,
      defaultScopes: [...policy.descriptor.defaultScopes],
      extraAuthParams: policy.descriptor.extraAuthParams ? { ...policy.descriptor.extraAuthParams } : undefined
    },
    capabilities: {
      ...policy.capabilities,
      allowedFeatureModes: [...policy.capabilities.allowedFeatureModes]
    },
    auth: policy.auth
      ? {
          ...policy.auth,
          defaultScopes: [...policy.auth.defaultScopes],
          availableClaims: [...policy.auth.availableClaims]
        }
      : undefined,
    runtime: policy.runtime ? { ...policy.runtime } : undefined,
    featureScopes: Object.fromEntries(
      Object.entries(policy.featureScopes).map(([feature, value]) => [
        feature,
        {
          allowedScopes: [...value.allowedScopes],
          restrictedScopes: value.restrictedScopes ? [...value.restrictedScopes] : undefined
        }
      ])
    ),
    operationPolicies: Object.fromEntries(
      Object.entries(policy.operationPolicies).map(([operation, value]) => [operation, { ...value }])
    )
  };
}

function cloneConsent(record: ConsentRecord): ConsentRecord {
  return {
    ...record,
    scopes: [...record.scopes]
  };
}

function cloneAuditEvent(event: PolicyAuditEvent): PolicyAuditEvent {
  return { ...event };
}
