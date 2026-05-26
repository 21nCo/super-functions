export type PolicyAuditEventType =
  | 'policy-decision'
  | 'policy-version-updated'
  | 'state-transition';

export interface ProviderPolicyMetadata {
  inbound: boolean;
  outbound: boolean;
  managed: boolean;
}

export interface ProviderPolicyDefinition {
  providerId: string;
  policyVersion: string;
  metadata: ProviderPolicyMetadata;
  allowedOperations: string[];
  blockedOperations?: Record<string, string>;
}

export interface PolicyDecisionInput {
  providerId: string;
  operation: string;
}

export interface PolicyDecision {
  providerId: string;
  operation: string;
  allowed: boolean;
  policyVersion: string;
  reason?: string;
  timestamp: string;
}

export interface ProviderPolicyUpdateInput {
  providerId: string;
  policyVersion: string;
  metadata: ProviderPolicyMetadata;
  allowedOperations: string[];
  blockedOperations?: Record<string, string>;
  actor: string;
}

export interface PolicyAuditEvent {
  type: PolicyAuditEventType;
  providerId: string;
  policyVersion: string;
  timestamp: string;
  actor?: string;
  operation?: string;
  allowed?: boolean;
  reason?: string;
  transition?: string;
  fromVersion?: string;
  toVersion?: string;
  details?: Record<string, string | number | boolean>;
}

export class ProviderPolicyServiceError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ProviderPolicyServiceError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

const DEFAULT_POLICY_VERSION = '2026-03-11';

const DEFAULT_PROVIDER_POLICIES: ProviderPolicyDefinition[] = [
  {
    providerId: 'gmail',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: false,
    },
    allowedOperations: ['mail.sync', 'mail.watch.create', 'mail.send'],
    blockedOperations: {
      'mail.read.fullbody': 'operation not allowed by policy',
    },
  },
  {
    providerId: 'outlook',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: false,
    },
    allowedOperations: ['mail.sync', 'mail.subscription.ensure', 'mail.send'],
  },
  {
    providerId: 'yahoo',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: false,
    },
    allowedOperations: ['mail.connect', 'mail.sync', 'mail.send'],
  },
  {
    providerId: 'icloud',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: false,
    },
    allowedOperations: ['mail.connect', 'mail.sync', 'mail.send'],
    blockedOperations: {
      'mail.connect.pop': 'icloud does not support POP',
    },
  },
  {
    providerId: 'imap-smtp',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: false,
    },
    allowedOperations: ['mail.connect', 'mail.sync', 'mail.send'],
    blockedOperations: {
      'mail.connect.insecure': 'insecure transport disabled',
    },
  },
  {
    providerId: 'forwarding',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: false,
      managed: false,
    },
    allowedOperations: ['mail.forwarding.enable', 'mail.forwarding.health'],
    blockedOperations: {
      'mail.forwarding.enable.mandatory': 'forwarding cannot be mandatory',
    },
  },
  {
    providerId: 'managed-mail',
    policyVersion: DEFAULT_POLICY_VERSION,
    metadata: {
      inbound: true,
      outbound: true,
      managed: true,
    },
    allowedOperations: ['mail.managed.enable', 'mail.managed.incident'],
    blockedOperations: {
      'mail.managed.enable.finance-unsafe': 'backup channel and risk acknowledgment required',
    },
  },
];

export class ProviderPolicyService {
  private readonly policyByProvider = new Map<string, ProviderPolicyDefinition>();
  private readonly auditLog: PolicyAuditEvent[] = [];
  private readonly now: () => string;

  constructor(
    policies: ProviderPolicyDefinition[] = DEFAULT_PROVIDER_POLICIES,
    now: () => string = () => new Date().toISOString()
  ) {
    this.now = now;
    for (const policy of policies) {
      this.policyByProvider.set(policy.providerId, clonePolicyDefinition(policy));
    }
  }

  getPolicy(providerId: string): ProviderPolicyDefinition {
    const policy = this.policyByProvider.get(providerId);
    if (!policy) {
      throw new ProviderPolicyServiceError(
        'VALIDATION_ERROR',
        `provider policy not found: ${providerId}`
      );
    }
    return clonePolicyDefinition(policy);
  }

  listPolicies(): ProviderPolicyDefinition[] {
    return [...this.policyByProvider.values()].map((policy) => clonePolicyDefinition(policy));
  }

  checkOperation(input: PolicyDecisionInput): PolicyDecision {
    const policy = this.getPolicy(input.providerId);
    const blockedReason = policy.blockedOperations?.[input.operation];
    if (blockedReason) {
      return this.recordDecision({
        providerId: input.providerId,
        operation: input.operation,
        allowed: false,
        policyVersion: policy.policyVersion,
        reason: blockedReason,
        timestamp: this.now(),
      });
    }

    if (!policy.allowedOperations.includes(input.operation)) {
      return this.recordDecision({
        providerId: input.providerId,
        operation: input.operation,
        allowed: false,
        policyVersion: policy.policyVersion,
        reason: 'operation not allowed by policy',
        timestamp: this.now(),
      });
    }

    return this.recordDecision({
      providerId: input.providerId,
      operation: input.operation,
      allowed: true,
      policyVersion: policy.policyVersion,
      timestamp: this.now(),
    });
  }

  assertOperationAllowed(input: PolicyDecisionInput): PolicyDecision {
    const decision = this.checkOperation(input);
    if (!decision.allowed) {
      throw new ProviderPolicyServiceError(
        'PROVIDER_POLICY_BLOCKED',
        decision.reason ?? 'operation not allowed by policy'
      );
    }
    return decision;
  }

  updatePolicy(input: ProviderPolicyUpdateInput): ProviderPolicyDefinition {
    const existing = this.policyByProvider.get(input.providerId);
    const nextPolicy: ProviderPolicyDefinition = {
      providerId: input.providerId,
      policyVersion: input.policyVersion,
      metadata: { ...input.metadata },
      allowedOperations: [...input.allowedOperations],
      blockedOperations: input.blockedOperations ? { ...input.blockedOperations } : undefined,
    };
    this.policyByProvider.set(input.providerId, nextPolicy);

    this.auditLog.push({
      type: 'policy-version-updated',
      providerId: input.providerId,
      policyVersion: input.policyVersion,
      timestamp: this.now(),
      actor: input.actor,
      fromVersion: existing?.policyVersion,
      toVersion: input.policyVersion,
    });

    return clonePolicyDefinition(nextPolicy);
  }

  recordStateTransition(input: {
    providerId: string;
    transition: string;
    policyVersion?: string;
    details?: Record<string, string | number | boolean>;
  }): void {
    const policy = this.policyByProvider.get(input.providerId);
    this.auditLog.push({
      type: 'state-transition',
      providerId: input.providerId,
      policyVersion: input.policyVersion ?? policy?.policyVersion ?? DEFAULT_POLICY_VERSION,
      timestamp: this.now(),
      transition: input.transition,
      details: input.details ? { ...input.details } : undefined,
    });
  }

  getAuditLog(): PolicyAuditEvent[] {
    return this.auditLog.map((entry) => ({
      ...entry,
      details: entry.details ? { ...entry.details } : undefined,
    }));
  }

  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  private recordDecision(decision: PolicyDecision): PolicyDecision {
    this.auditLog.push({
      type: 'policy-decision',
      providerId: decision.providerId,
      policyVersion: decision.policyVersion,
      timestamp: decision.timestamp,
      operation: decision.operation,
      allowed: decision.allowed,
      reason: decision.reason,
    });
    return { ...decision };
  }
}

export function createProviderPolicyService(
  policies: ProviderPolicyDefinition[] = DEFAULT_PROVIDER_POLICIES,
  now?: () => string
): ProviderPolicyService {
  return new ProviderPolicyService(policies, now);
}

function clonePolicyDefinition(policy: ProviderPolicyDefinition): ProviderPolicyDefinition {
  return {
    providerId: policy.providerId,
    policyVersion: policy.policyVersion,
    metadata: { ...policy.metadata },
    allowedOperations: [...policy.allowedOperations],
    blockedOperations: policy.blockedOperations ? { ...policy.blockedOperations } : undefined,
  };
}
