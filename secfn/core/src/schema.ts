import type { TableSchema } from "@superfunctions/db";

export const SECFN_SCHEMA_VERSION = 4;

export function getSecFnSchema(): TableSchema[] {
  return withIsoDateDefaults([
    {
      modelName: "secfn_namespaces",
      fields: {
        id: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        slug: { type: "string", required: true },
        label: { type: "string", required: true },
        description: { type: "string", required: false },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        updatedAt: { type: "date", required: true, fieldName: "updated_at" },
        metadata: { type: "json", required: false },
      },
      indexes: [
        { name: "idx_secfn_namespaces_lookup", fields: ["tenantId", "slug"], unique: true },
      ],
    },
    {
      modelName: "secfn_environments",
      fields: {
        id: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespaceId: { type: "string", required: false, fieldName: "namespace_id" },
        name: { type: "string", required: true },
        description: { type: "string", required: false },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        updatedAt: { type: "date", required: true, fieldName: "updated_at" },
        metadata: { type: "json", required: false },
      },
      indexes: [
        { name: "idx_secfn_environments_lookup", fields: ["tenantId", "namespaceId", "name"], unique: true },
      ],
    },
    {
      modelName: "secfn_secrets",
      fields: {
        id: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespaceId: { type: "string", required: true, fieldName: "namespace_id" },
        namespace: { type: "string", required: false },
        key: { type: "string", required: true },
        environmentId: { type: "string", required: true, fieldName: "environment_id" },
        environment: { type: "string", required: false },
        description: { type: "string", required: false },
        tags: { type: "json", required: true },
        currentVersion: { type: "number", required: true, fieldName: "current_version" },
        revokedAt: { type: "date", required: false, fieldName: "revoked_at" },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        updatedAt: { type: "date", required: true, fieldName: "updated_at" },
        metadata: { type: "json", required: false },
      },
      indexes: [
        { name: "idx_secfn_secrets_lookup", fields: ["tenantId", "namespaceId", "environmentId", "key"], unique: true },
        { name: "idx_secfn_secrets_revoked", fields: ["revokedAt"] },
      ],
    },
    {
      modelName: "secfn_secret_versions",
      fields: {
        id: { type: "string", required: true },
        secretId: { type: "string", required: true, fieldName: "secret_id" },
        version: { type: "number", required: true },
        encryptedPayload: { type: "json", required: true, fieldName: "encrypted_payload" },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
      },
      indexes: [
        { name: "idx_secfn_secret_versions_secret_version", fields: ["secretId", "version"], unique: true },
      ],
    },
    {
      modelName: "secfn_secret_sets",
      fields: {
        id: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespaceId: { type: "string", required: true, fieldName: "namespace_id" },
        namespace: { type: "string", required: false },
        environmentId: { type: "string", required: false, fieldName: "environment_id" },
        name: { type: "string", required: true },
        description: { type: "string", required: false },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        updatedAt: { type: "date", required: true, fieldName: "updated_at" },
      },
      indexes: [
        { name: "idx_secfn_secret_sets_lookup", fields: ["tenantId", "namespaceId", "name"], unique: true },
      ],
    },
    {
      modelName: "secfn_secret_set_members",
      fields: {
        id: { type: "string", required: true },
        setId: { type: "string", required: true, fieldName: "set_id" },
        secretId: { type: "string", required: true, fieldName: "secret_id" },
        alias: { type: "string", required: false },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
      },
      indexes: [
        { name: "idx_secfn_secret_set_members_set", fields: ["setId"] },
      ],
    },
    {
      modelName: "secfn_service_tokens",
      fields: {
        id: { type: "string", required: true },
        tokenHash: { type: "string", required: true, fieldName: "token_hash" },
        name: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespace: { type: "string", required: false },
        environment: { type: "string", required: false },
        scopes: { type: "json", required: true },
        expiresAt: { type: "date", required: false, fieldName: "expires_at" },
        revokedAt: { type: "date", required: false, fieldName: "revoked_at" },
        createdBy: { type: "string", required: true, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        lastUsedAt: { type: "date", required: false, fieldName: "last_used_at" },
      },
      indexes: [
        { name: "idx_secfn_service_tokens_hash", fields: ["tokenHash"], unique: true },
      ],
    },
    {
      modelName: "secfn_roles",
      fields: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        description: { type: "string", required: false },
        permissions: { type: "json", required: true },
        inherits: { type: "json", required: false },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        updatedAt: { type: "date", required: true, fieldName: "updated_at" },
        metadata: { type: "json", required: false },
      },
      indexes: [
        { name: "idx_secfn_roles_name", fields: ["name"], unique: true },
      ],
    },
    {
      modelName: "secfn_role_bindings",
      fields: {
        id: { type: "string", required: true },
        principalId: { type: "string", required: true, fieldName: "principal_id" },
        roleId: { type: "string", required: true, fieldName: "role_id" },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespace: { type: "string", required: false },
        resourceId: { type: "string", required: false, fieldName: "resource_id" },
        expiresAt: { type: "date", required: false, fieldName: "expires_at" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        createdBy: { type: "string", required: false, fieldName: "created_by" },
      },
      indexes: [
        { name: "idx_secfn_role_bindings_principal", fields: ["principalId"] },
      ],
    },
    {
      modelName: "secfn_audit_events",
      fields: {
        id: { type: "string", required: true },
        timestamp: { type: "date", required: true },
        type: { type: "string", required: true },
        severity: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        namespaceId: { type: "string", required: false, fieldName: "namespace_id" },
        namespace: { type: "string", required: false },
        environmentId: { type: "string", required: false, fieldName: "environment_id" },
        environment: { type: "string", required: false },
        actorId: { type: "string", required: false, fieldName: "actor_id" },
        ip: { type: "string", required: false },
        userAgent: { type: "string", required: false, fieldName: "user_agent" },
        resource: { type: "string", required: false },
        action: { type: "string", required: false },
        requestId: { type: "string", required: false, fieldName: "request_id" },
        metadata: { type: "json", required: true },
        resolved: { type: "boolean", required: true },
        resolvedAt: { type: "date", required: false, fieldName: "resolved_at" },
        resolvedBy: { type: "string", required: false, fieldName: "resolved_by" },
        notes: { type: "string", required: false },
      },
      indexes: [
        { name: "idx_secfn_audit_events_timestamp", fields: ["timestamp"] },
        { name: "idx_secfn_audit_events_type", fields: ["type"] },
        { name: "idx_secfn_audit_events_severity", fields: ["severity"] },
      ],
    },
    {
      modelName: "secfn_scan_runs",
      fields: {
        id: { type: "string", required: true },
        tenantId: { type: "string", required: false, fieldName: "tenant_id" },
        startedAt: { type: "date", required: true, fieldName: "started_at" },
        completedAt: { type: "date", required: false, fieldName: "completed_at" },
        target: { type: "string", required: true },
        status: { type: "string", required: true },
        findingCount: { type: "number", required: true, fieldName: "finding_count" },
        metadata: { type: "json", required: false },
      },
      indexes: [{ name: "idx_secfn_scan_runs_tenant", fields: ["tenantId"] }],
    },
    {
      modelName: "secfn_scan_findings",
      fields: {
        id: { type: "string", required: true },
        runId: { type: "string", required: false, fieldName: "run_id" },
        ruleId: { type: "string", required: true, fieldName: "rule_id" },
        ruleName: { type: "string", required: true, fieldName: "rule_name" },
        severity: { type: "string", required: true },
        message: { type: "string", required: true },
        file: { type: "string", required: true },
        line: { type: "number", required: true },
        column: { type: "number", required: true },
        redactedMatch: { type: "string", required: false, fieldName: "redacted_match" },
        fingerprint: { type: "string", required: true },
        context: { type: "string", required: false },
        metadata: { type: "json", required: false },
      },
      indexes: [
        { name: "idx_secfn_scan_findings_run", fields: ["runId"] },
        { name: "idx_secfn_scan_findings_severity", fields: ["severity"] },
      ],
    },
  ]);
}

export interface SecFnSchemaDefinition {
  version: number;
  schemas: TableSchema[];
}

export function getSchema(): SecFnSchemaDefinition {
  return {
    version: SECFN_SCHEMA_VERSION,
    schemas: getSecFnSchema(),
  };
}

function withIsoDateDefaults(tables: TableSchema[]): TableSchema[] {
  return tables.map((table) => ({
    ...table,
    fields: Object.fromEntries(
      Object.entries(table.fields).map(([name, field]) => [
        name,
        field.type === "date" || field.type === "datetime"
          ? {
              dateValueType: "iso-string",
              dateStorageType: "timestamptz",
              ...field,
            }
          : field,
      ])
    ),
  }));
}
