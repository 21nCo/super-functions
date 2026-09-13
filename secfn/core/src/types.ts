export type SecFnEnvironment = string;

export type SecFnSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecFnLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface KeyMaterial {
  keyId: string;
  secret: string | Uint8Array;
}

export interface KeyProvider {
  resolveKey(input?: { keyId?: string; purpose?: "encrypt" | "decrypt" }): Promise<KeyMaterial> | KeyMaterial;
}

export interface SecFnEncryptionConfig {
  masterKey: string;
  keyId?: string;
}

export interface SecFnSecretScope {
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  environmentId?: string;
  environment?: SecFnEnvironment;
}

export interface SecFnRuntimeClientConfig extends SecFnSecretScope {
  endpoint: string;
  apiKey: string;
  cache?: {
    ttlMs: number;
    staleWhileRevalidate?: boolean;
  };
}

export interface SecFnServerCoreConfig {
  basePath?: string;
  encryption?: SecFnEncryptionConfig;
}

export interface SecFnRateLimitPolicyConfig {
  enabled?: boolean;
  algorithm?: "fixed-window" | "sliding-window" | "token-bucket";
  windowMs?: number;
  limits?: {
    perIP?: number;
    perUser?: number;
    perEndpoint?: number;
  };
}

export interface EncryptedSecretPayload {
  algorithm: "AES-256-GCM";
  keyId: string;
  iv: string;
  salt: string;
  authTag: string;
  ciphertext: string;
}

export interface SecretAadInput {
  tenantId?: string;
  namespace?: string;
  secretId: string;
  version: number;
}

export interface NamespaceRecord {
  id: string;
  tenantId?: string;
  slug: string;
  label: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface EnvironmentRecord {
  id: string;
  tenantId?: string;
  namespaceId?: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SecretRecord {
  id: string;
  tenantId?: string;
  namespaceId: string;
  namespace?: string;
  key: string;
  environmentId: string;
  environment?: SecFnEnvironment;
  description?: string;
  tags: string[];
  currentVersion: number;
  revokedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SecretVersionRecord {
  id: string;
  secretId: string;
  version: number;
  encryptedPayload: EncryptedSecretPayload;
  createdBy: string;
  createdAt: string;
}

export interface SecretSetRecord {
  id: string;
  tenantId?: string;
  namespaceId: string;
  namespace?: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretSetMemberRecord {
  id: string;
  setId: string;
  secretId: string;
  alias?: string;
  createdAt: string;
}

export interface ServiceTokenRecord {
  id: string;
  tokenHash: string;
  name: string;
  tenantId?: string;
  namespace?: string;
  environment?: SecFnEnvironment;
  scopes: string[];
  expiresAt?: string;
  revokedAt?: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  inherits?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface RoleBindingRecord {
  id: string;
  principalId: string;
  roleId: string;
  tenantId?: string;
  namespace?: string;
  resourceId?: string;
  expiresAt?: string;
  createdAt: string;
  createdBy?: string;
}

export type SecurityEventType =
  | "auth_failure"
  | "rate_limit_exceeded"
  | "unauthorized_access"
  | "secret_accessed"
  | "permission_denied"
  | "suspicious_activity"
  | "secret_exposed"
  | "policy_violation";

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  severity: SecFnSeverity;
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  environmentId?: string;
  environment?: SecFnEnvironment;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  topActors: Array<{ actorId: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
}

export interface SecurityScanRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  target: string;
  status: "running" | "completed" | "failed";
  findingCount: number;
  metadata?: Record<string, unknown>;
}

export interface SecurityFinding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: SecFnSeverity;
  message: string;
  file: string;
  line: number;
  column: number;
  match?: string;
  redactedMatch?: string;
  fingerprint: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityRuleContext {
  target: ScanTarget;
  content: string;
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  severity: SecFnSeverity;
  evaluate(context: SecurityRuleContext): SecurityFinding[];
}

export interface RulePack {
  id: string;
  name: string;
  rules: SecurityRule[];
}

export interface ScanTarget {
  path: string;
  displayPath?: string;
}

export type ScanFormat = "table" | "json" | "sarif";

export interface RuntimeSecretResponse {
  key: string;
  value: string;
  environment?: SecFnEnvironment;
  version: number;
}

export interface RuntimeSecretSetResponse {
  name: string;
  secrets: Record<string, string>;
  namespace?: string;
}
