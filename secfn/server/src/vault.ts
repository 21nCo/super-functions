import { randomBytes } from "node:crypto";
import type { Adapter, WhereClause } from "@superfunctions/db";
import {
  buildSecretAad,
  decryptSecret,
  encryptSecret,
  generateId,
  hashToken,
  nowIso,
} from "@secfn/core";
import type {
  EnvironmentRecord,
  KeyProvider,
  NamespaceRecord,
  RuntimeSecretResponse,
  RuntimeSecretSetResponse,
  SecretRecord,
  SecretSetMemberRecord,
  SecretSetRecord,
  SecretVersionRecord,
  ServiceTokenRecord,
} from "@secfn/core";
import { SecFnForbiddenError, SecFnNotFoundError, SecFnValidationError } from "@secfn/core";
import type { AuditService } from "./audit.js";
import { scopeWhere, omit } from "./db.js";
import type { SecretScope } from "./types.js";

const DEFAULT_NAMESPACE = "default";
const DEFAULT_ENVIRONMENT = "development";

export interface CreateNamespaceInput {
  tenantId?: string;
  slug: string;
  label?: string;
  description?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateNamespaceInput {
  slug?: string;
  label?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateEnvironmentInput {
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  name: string;
  description?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateEnvironmentInput {
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateSecretInput extends SecretScope {
  key: string;
  value: string;
  description?: string;
  tags?: string[];
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSecretInput extends SecretScope {
  key?: string;
  description?: string | null;
  tags?: string[];
  actorId: string;
  requireRenameConfirmation?: boolean;
}

export interface SecretListInput extends SecretScope {
  limit?: number;
  cursor?: string;
  search?: string;
  tag?: string;
}

export interface SecretPage {
  items: SecretRecord[];
  nextCursor?: string;
}

export interface RotateSecretInput {
  value: string;
  actorId: string;
}

export interface RevealSecretInput {
  actorId: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface CreateSecretSetInput extends SecretScope {
  name: string;
  description?: string;
  members?: Array<{ secretId: string; alias?: string }>;
  createdBy: string;
}

export interface UpdateSecretSetInput {
  name?: string;
  description?: string | null;
  actorId: string;
}

export interface UpdateSecretSetMemberInput {
  secretId?: string;
  alias?: string | null;
}

export interface CreateServiceTokenInput extends SecretScope {
  name: string;
  scopes: string[];
  expiresAt?: string;
  createdBy: string;
}

export interface VerifiedRuntimeToken {
  token: ServiceTokenRecord;
}

export class VaultService {
  constructor(
    private readonly db: Adapter,
    private readonly keyProvider: KeyProvider,
    private readonly audit: AuditService,
  ) {}

  async listNamespaces(input: { tenantId?: string } = {}): Promise<NamespaceRecord[]> {
    const rows = await this.db.findMany<NamespaceRecord>({
      model: "secfn_namespaces",
      where: input.tenantId ? [{ field: "tenantId", operator: "eq", value: input.tenantId }] : [],
      orderBy: [{ field: "label", direction: "asc" }],
      limit: 1000,
    });
    if (rows.length > 0) return rows;
    return [await this.ensureNamespace({ tenantId: input.tenantId, namespace: DEFAULT_NAMESPACE, createdBy: "system" })];
  }

  async createNamespace(input: CreateNamespaceInput): Promise<NamespaceRecord> {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new SecFnValidationError("Namespace slug is required");
    const existing = await this.findNamespace({ tenantId: input.tenantId, namespace: slug });
    if (existing) throw new SecFnValidationError("Namespace already exists", { slug });
    const now = nowIso();
    return this.db.create<NamespaceRecord>({
      model: "secfn_namespaces",
      data: {
        id: generateId("ns"),
        tenantId: input.tenantId,
        slug,
        label: cleanString(input.label) ?? slug,
        description: cleanString(input.description),
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata,
      } as unknown as Record<string, unknown>,
    });
  }

  async updateNamespace(id: string, input: UpdateNamespaceInput): Promise<NamespaceRecord> {
    const existing = await this.getNamespace(id);
    const data: Partial<NamespaceRecord> = { updatedAt: nowIso() };
    if (input.slug !== undefined) {
      const slug = normalizeSlug(input.slug);
      if (!slug) throw new SecFnValidationError("Namespace slug is required");
      const duplicate = await this.findNamespace({ tenantId: existing.tenantId, namespace: slug });
      if (duplicate && duplicate.id !== id) throw new SecFnValidationError("Namespace slug already exists", { slug });
      data.slug = slug;
    }
    if (input.label !== undefined) data.label = cleanString(input.label) ?? existing.label;
    if (input.description !== undefined) data.description = input.description ?? undefined;
    if (input.metadata !== undefined) data.metadata = input.metadata ?? undefined;
    return this.db.update<NamespaceRecord>({
      model: "secfn_namespaces",
      where: [{ field: "id", operator: "eq", value: id }],
      data: data as Record<string, unknown>,
    });
  }

  async listEnvironments(input: { tenantId?: string; namespaceId?: string; namespace?: string } = {}): Promise<EnvironmentRecord[]> {
    const namespace = input.namespaceId || input.namespace
      ? await this.ensureNamespace({ tenantId: input.tenantId, namespaceId: input.namespaceId, namespace: input.namespace, createdBy: "system" })
      : undefined;
    const rows = await this.db.findMany<EnvironmentRecord>({
      model: "secfn_environments",
      where: input.tenantId ? [{ field: "tenantId", operator: "eq", value: input.tenantId }] : [],
      orderBy: [{ field: "name", direction: "asc" }],
      limit: 1000,
    });
    const inherited = rows.filter((row) => !row.namespaceId || row.namespaceId === namespace?.id);
    if (inherited.length > 0) return inherited;
    return [
      await this.ensureEnvironment({
        tenantId: input.tenantId,
        namespaceId: undefined,
        environment: DEFAULT_ENVIRONMENT,
        createdBy: "system",
      }),
    ];
  }

  async createEnvironment(input: CreateEnvironmentInput): Promise<EnvironmentRecord> {
    const name = normalizeName(input.name);
    if (!name) throw new SecFnValidationError("Environment name is required");
    const namespaceId = input.namespaceId || input.namespace
      ? (await this.ensureNamespace({
        tenantId: input.tenantId,
        namespaceId: input.namespaceId,
        namespace: input.namespace,
        createdBy: input.createdBy,
      })).id
      : undefined;
    const existing = await this.findEnvironment({ tenantId: input.tenantId, namespaceId, environment: name });
    if (existing) throw new SecFnValidationError("Environment already exists", { name });
    const now = nowIso();
    return this.db.create<EnvironmentRecord>({
      model: "secfn_environments",
      data: {
        id: generateId("env"),
        tenantId: input.tenantId,
        namespaceId,
        name,
        description: cleanString(input.description),
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata,
      } as unknown as Record<string, unknown>,
    });
  }

  async updateEnvironment(id: string, input: UpdateEnvironmentInput): Promise<EnvironmentRecord> {
    const existing = await this.getEnvironment(id);
    const data: Partial<EnvironmentRecord> = { updatedAt: nowIso() };
    if (input.name !== undefined) {
      const name = normalizeName(input.name);
      if (!name) throw new SecFnValidationError("Environment name is required");
      const duplicate = await this.findEnvironment({
        tenantId: existing.tenantId,
        namespaceId: existing.namespaceId,
        environment: name,
      });
      if (duplicate && duplicate.id !== id) throw new SecFnValidationError("Environment already exists", { name });
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description ?? undefined;
    if (input.metadata !== undefined) data.metadata = input.metadata ?? undefined;
    return this.db.update<EnvironmentRecord>({
      model: "secfn_environments",
      where: [{ field: "id", operator: "eq", value: id }],
      data: data as Record<string, unknown>,
    });
  }

  async createSecret(input: CreateSecretInput): Promise<SecretRecord> {
    if (!input.key.trim()) throw new SecFnValidationError("Secret key is required");
    const resolved = await this.resolveScope(input, { requireNamespace: true, requireEnvironment: true, create: true, actorId: input.createdBy });
    const existing = await this.findSecretByKey(input.key, resolved);
    if (existing) {
      throw new SecFnValidationError("Secret already exists", { key: input.key });
    }

    const now = nowIso();
    const secret: SecretRecord = {
      id: generateId("secret"),
      tenantId: input.tenantId,
      namespaceId: resolved.namespaceId!,
      namespace: resolved.namespace,
      key: input.key,
      environmentId: resolved.environmentId!,
      environment: resolved.environment,
      description: input.description,
      tags: input.tags ?? [],
      currentVersion: 1,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };
    const version = await this.createVersion(secret, input.value, input.createdBy);
    await this.db.create({ model: "secfn_secrets", data: secret as unknown as Record<string, unknown> });
    await this.db.create({ model: "secfn_secret_versions", data: version as unknown as Record<string, unknown> });
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId: input.createdBy,
      resource: `secret:${secret.key}`,
      action: "create",
      metadata: { secretId: secret.id, version: 1 },
    });
    return secret;
  }

  async listSecrets(input: SecretListInput = {}): Promise<SecretPage> {
    const scope = await this.resolveScope(input, { allowAll: true });
    const limit = clampLimit(input.limit ?? 50);
    let rows = await this.db.findMany<SecretRecord>({
      model: "secfn_secrets",
      where: scopeWhere(scope),
      orderBy: [{ field: "updatedAt", direction: "desc" }, { field: "id", direction: "desc" }],
      limit: 1000,
    });
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      rows = rows.filter((row) => compareCursor(row, cursor) > 0);
    }
    if (input.search?.trim()) {
      const query = input.search.trim().toLowerCase();
      rows = rows.filter((row) =>
        row.key.toLowerCase().includes(query) ||
        (row.description ?? "").toLowerCase().includes(query),
      );
    }
    if (input.tag?.trim()) {
      rows = rows.filter((row) => row.tags.includes(input.tag!.trim()));
    }
    const items = await this.hydrateSecrets(rows.slice(0, limit));
    const next = rows[limit];
    return { items, nextCursor: next ? encodeCursor(next) : undefined };
  }

  async getSecret(id: string): Promise<SecretRecord> {
    return this.hydrateSecret(await this.getSecretRow(id));
  }

  async updateSecret(id: string, input: UpdateSecretInput): Promise<SecretRecord> {
    const existing = await this.getSecret(id);
    const data: Partial<SecretRecord> = { updatedAt: nowIso() };
    if (input.key !== undefined) {
      const key = input.key.trim();
      if (!key) throw new SecFnValidationError("Secret key is required");
      if (key !== existing.key) {
        if (!input.requireRenameConfirmation) throw new SecFnValidationError("Secret rename requires confirmation");
        const duplicate = await this.findSecretByKey(key, {
          tenantId: existing.tenantId,
          namespaceId: existing.namespaceId,
          environmentId: existing.environmentId,
        });
        if (duplicate && duplicate.id !== id && !duplicate.revokedAt) throw new SecFnValidationError("Secret already exists", { key });
        data.key = key;
      }
    }
    if (input.description !== undefined) data.description = input.description ?? undefined;
    if (input.tags !== undefined) data.tags = input.tags;
    const saved = Object.keys(data).length === 1
      ? existing
      : await this.db.update<SecretRecord>({
        model: "secfn_secrets",
        where: [{ field: "id", operator: "eq", value: id }],
        data: data as Record<string, unknown>,
      });
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: existing.tenantId,
      namespaceId: existing.namespaceId,
      namespace: existing.namespace,
      environmentId: existing.environmentId,
      environment: existing.environment,
      actorId: input.actorId,
      resource: `secret:${existing.key}`,
      action: "update",
      metadata: { secretId: id, renamedTo: data.key },
    });
    return this.hydrateSecret(saved);
  }

  async rotateSecret(id: string, input: RotateSecretInput): Promise<SecretRecord> {
    const secret = await this.getSecret(id);
    const nextVersion = secret.currentVersion + 1;
    const updated: Partial<SecretRecord> = {
      currentVersion: nextVersion,
      updatedAt: nowIso(),
    };
    const version = await this.createVersion({ ...secret, currentVersion: nextVersion }, input.value, input.actorId);
    await this.db.create({ model: "secfn_secret_versions", data: version as unknown as Record<string, unknown> });
    const saved = await this.db.update<SecretRecord>({
      model: "secfn_secrets",
      where: [{ field: "id", operator: "eq", value: id }],
      data: updated as Record<string, unknown>,
    });
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId: input.actorId,
      resource: `secret:${secret.key}`,
      action: "rotate",
      metadata: { secretId: secret.id, version: nextVersion },
    });
    return this.hydrateSecret(saved);
  }

  async revealSecret(id: string, input: RevealSecretInput): Promise<RuntimeSecretResponse> {
    const secret = await this.getSecret(id);
    if (secret.revokedAt) throw new SecFnNotFoundError("Secret not found", { id });
    const version = await this.getSecretVersion(secret.id, secret.currentVersion);
    const value = await decryptSecret(
      version.encryptedPayload,
      this.keyProvider,
      buildSecretAad({
        tenantId: secret.tenantId,
        namespace: secret.namespaceId,
        secretId: secret.id,
        version: version.version,
      }),
    );
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId: input.actorId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      resource: `secret:${secret.key}`,
      action: "reveal",
      metadata: { secretId: secret.id, version: version.version },
    });
    return { key: secret.key, value, environment: secret.environment, version: version.version };
  }

  async revokeSecret(id: string, actorId: string): Promise<void> {
    const secret = await this.getSecret(id);
    await this.db.update({
      model: "secfn_secrets",
      where: [{ field: "id", operator: "eq", value: id }],
      data: { revokedAt: nowIso(), updatedAt: nowIso() },
    });
    await this.audit.write({
      type: "policy_violation",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId,
      resource: `secret:${secret.key}`,
      action: "revoke",
      metadata: { secretId: secret.id },
    });
  }

  async deleteSecret(id: string, actorId: string): Promise<void> {
    const secret = await this.getSecret(id);
    // Revoke first: a failed cleanup remains inaccessible and can be retried.
    await this.db.update({ model: "secfn_secrets", where: [{ field: "id", operator: "eq", value: id }], data: { revokedAt: nowIso() } });
    await this.db.deleteMany({ model: "secfn_secret_set_members", where: [{ field: "secretId", operator: "eq", value: id }] });
    await this.db.deleteMany({ model: "secfn_secret_versions", where: [{ field: "secretId", operator: "eq", value: id }] });
    await this.db.delete({ model: "secfn_secrets", where: [{ field: "id", operator: "eq", value: id }] });
    await this.audit.write({
      type: "policy_violation",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId,
      resource: `secret:${secret.key}`,
      action: "delete",
      metadata: { secretId: secret.id },
    });
  }

  async createSecretSet(input: CreateSecretSetInput): Promise<SecretSetRecord> {
    if (!input.name.trim()) throw new SecFnValidationError("Secret set name is required");
    const resolved = await this.resolveScope(input, { requireNamespace: true, ignoreEnvironment: true, create: true, actorId: input.createdBy });
    const duplicate = await this.db.findOne<SecretSetRecord>({
      model: "secfn_secret_sets",
      where: scopeWhere({ tenantId: input.tenantId, namespaceId: resolved.namespaceId, name: input.name }),
    });
    if (duplicate) throw new SecFnValidationError("Secret set already exists", { name: input.name });
    const now = nowIso();
    const set: SecretSetRecord = {
      id: generateId("set"),
      tenantId: input.tenantId,
      namespaceId: resolved.namespaceId!,
      namespace: resolved.namespace,
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.create({ model: "secfn_secret_sets", data: set as unknown as Record<string, unknown> });
    for (const member of input.members ?? []) {
      await this.addSecretSetMember(set.id, member.secretId, member.alias);
    }
    return set;
  }

  async getSecretSet(id: string): Promise<SecretSetRecord> {
    return this.hydrateSet(await this.getSecretSetRow(id));
  }

  async listSecretSets(scope: SecretScope = {}): Promise<SecretSetRecord[]> {
    const resolved = await this.resolveScope(scope, { allowAll: true, ignoreEnvironment: true });
    const rows = await this.db.findMany<SecretSetRecord>({
      model: "secfn_secret_sets",
      where: scopeWhere({ tenantId: resolved.tenantId, namespaceId: resolved.namespaceId }),
      orderBy: [{ field: "updatedAt", direction: "desc" }],
      limit: 500,
    });
    return this.hydrateSets(rows);
  }

  async updateSecretSet(id: string, input: UpdateSecretSetInput): Promise<SecretSetRecord> {
    const existing = await this.getSecretSet(id);
    const data: Partial<SecretSetRecord> = { updatedAt: nowIso() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new SecFnValidationError("Secret set name is required");
      if (name !== existing.name) {
        const duplicate = await this.db.findOne<SecretSetRecord>({
          model: "secfn_secret_sets",
          where: scopeWhere({ tenantId: existing.tenantId, namespaceId: existing.namespaceId, name }),
        });
        if (duplicate && duplicate.id !== id) throw new SecFnValidationError("Secret set already exists", { name });
        data.name = name;
      }
    }
    if (input.description !== undefined) data.description = input.description ?? undefined;
    const saved = Object.keys(data).length === 1
      ? existing
      : await this.db.update<SecretSetRecord>({
        model: "secfn_secret_sets",
        where: [{ field: "id", operator: "eq", value: id }],
        data: data as Record<string, unknown>,
      });
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: existing.tenantId,
      namespaceId: existing.namespaceId,
      namespace: existing.namespace,
      actorId: input.actorId,
      resource: `secret-set:${existing.name}`,
      action: "update",
      metadata: { setId: id, renamedTo: data.name },
    });
    return this.hydrateSet(saved);
  }

  async addSecretSetMember(setId: string, secretId: string, alias?: string): Promise<SecretSetMemberRecord> {
    const [set, secret] = await Promise.all([
      this.getSecretSetRow(setId),
      this.getSecretRow(secretId),
    ]);
    if (secret.namespaceId !== set.namespaceId) {
      throw new SecFnValidationError("Secret set members must belong to the same namespace", { setId, secretId });
    }
    await this.assertUniqueSetOutputName(setId, { secretId, alias }, secret);
    const member: SecretSetMemberRecord = {
      id: generateId("member"),
      setId,
      secretId,
      alias: cleanString(alias),
      createdAt: nowIso(),
    };
    await this.db.create({ model: "secfn_secret_set_members", data: member as unknown as Record<string, unknown> });
    return member;
  }

  async listSecretSetMembers(setId: string): Promise<SecretSetMemberRecord[]> {
    await this.getSecretSetRow(setId);
    return this.db.findMany<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "setId", operator: "eq", value: setId }],
      orderBy: [{ field: "createdAt", direction: "asc" }],
      limit: 1000,
    });
  }

  async updateSecretSetMember(id: string, input: UpdateSecretSetMemberInput): Promise<SecretSetMemberRecord> {
    const existing = await this.db.findOne<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!existing) throw new SecFnNotFoundError("Secret set member not found", { id });
    const set = await this.getSecretSetRow(existing.setId);
    const nextSecretId = input.secretId ?? existing.secretId;
    const nextSecret = await this.getSecretRow(nextSecretId);
    if (nextSecret.namespaceId !== set.namespaceId) {
      throw new SecFnValidationError("Secret set members must belong to the same namespace", { setId: set.id, secretId: nextSecretId });
    }
    const data: Record<string, unknown> = {};
    if (input.secretId !== undefined) data.secretId = input.secretId;
    if (input.alias !== undefined) data.alias = cleanString(input.alias ?? undefined);
    if (Object.keys(data).length === 0) return existing;
    await this.assertUniqueSetOutputName(existing.setId, {
      secretId: nextSecretId,
      alias: input.alias === undefined ? existing.alias : input.alias ?? undefined,
      memberId: existing.id,
    }, nextSecret);
    return this.db.update<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "id", operator: "eq", value: id }],
      data,
    });
  }

  async removeSecretSetMember(id: string): Promise<void> {
    const existing = await this.db.findOne<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!existing) throw new SecFnNotFoundError("Secret set member not found", { id });
    await this.db.delete({
      model: "secfn_secret_set_members",
      where: [{ field: "id", operator: "eq", value: id }],
    });
  }

  async deleteSecretSet(id: string, actorId: string): Promise<void> {
    const set = await this.getSecretSet(id);
    await this.db.deleteMany({
      model: "secfn_secret_set_members",
      where: [{ field: "setId", operator: "eq", value: id }],
    });
    await this.db.delete({
      model: "secfn_secret_sets",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    await this.audit.write({
      type: "policy_violation",
      severity: "info",
      tenantId: set.tenantId,
      namespaceId: set.namespaceId,
      namespace: set.namespace,
      actorId,
      resource: `secret-set:${set.name}`,
      action: "delete",
      metadata: { setId: set.id },
    });
  }

  async revealSecretSet(
    id: string,
    input: RevealSecretInput,
  ): Promise<{ name: string; secrets: Record<string, string>; dotenv: string }> {
    const set = await this.getSecretSet(id);
    const members = await this.listSecretSetMembers(id);
    const secrets: Record<string, string> = {};
    for (const member of members) {
      const secret = await this.getSecret(member.secretId);
      if (secret.revokedAt) continue;
      const version = await this.getSecretVersion(secret.id, secret.currentVersion);
      secrets[member.alias ?? secret.key] = await decryptSecret(
        version.encryptedPayload,
        this.keyProvider,
        buildSecretAad({
          tenantId: secret.tenantId,
          namespace: secret.namespaceId,
          secretId: secret.id,
          version: version.version,
        }),
      );
    }
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: set.tenantId,
      namespaceId: set.namespaceId,
      namespace: set.namespace,
      actorId: input.actorId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      resource: `secret-set:${set.name}`,
      action: "reveal",
      metadata: { setId: set.id, count: Object.keys(secrets).length },
    });
    return { name: set.name, secrets, dotenv: formatDotEnv(secrets) };
  }

  async createServiceToken(input: CreateServiceTokenInput): Promise<{ token: string; record: Omit<ServiceTokenRecord, "tokenHash"> }> {
    let namespace = input.namespaceId
      ? await this.ensureNamespace({ ...input, create: false })
      : input.namespace ? await this.findNamespace(input) : undefined;
    const environment = input.environmentId
      ? await this.getEnvironment(input.environmentId) : undefined;
    if (environment) {
      if (input.tenantId !== undefined && environment.tenantId !== input.tenantId) throw new SecFnNotFoundError("Environment not found");
      if (environment.namespaceId) {
        if (namespace && namespace.id !== environment.namespaceId) throw new SecFnValidationError("Token scope mismatch");
        namespace = await this.ensureNamespace({ tenantId: input.tenantId, namespaceId: environment.namespaceId, createdBy: input.createdBy, create: false });
      }
    }
    const token = `secfn_${randomBytes(24).toString("base64url")}`;
    const record: ServiceTokenRecord = {
      id: generateId("stok"),
      tokenHash: hashToken(token),
      name: input.name,
      tenantId: input.tenantId ?? namespace?.tenantId ?? environment?.tenantId,
      namespace: namespace?.slug ?? (input.namespace ? normalizeSlug(input.namespace) : undefined),
      environment: environment?.name ?? (input.environment ? normalizeName(input.environment) : undefined),
      scopes: input.scopes,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
      createdAt: nowIso(),
    };
    await this.db.create({ model: "secfn_service_tokens", data: record as unknown as Record<string, unknown> });
    return { token, record: omit(record as unknown as Record<string, unknown>, ["tokenHash"]) as Omit<ServiceTokenRecord, "tokenHash"> };
  }

  async revokeServiceToken(id: string, actorId: string): Promise<void> {
    await this.db.update({
      model: "secfn_service_tokens",
      where: [{ field: "id", operator: "eq", value: id }],
      data: { revokedAt: nowIso() },
    });
    await this.audit.write({
      type: "policy_violation",
      severity: "info",
      actorId,
      resource: `service-token:${id}`,
      action: "revoke",
      metadata: {},
    });
  }

  async verifyRuntimeToken(rawToken: string, scope: SecretScope): Promise<VerifiedRuntimeToken> {
    const token = await this.db.findOne<ServiceTokenRecord>({
      model: "secfn_service_tokens",
      where: [{ field: "tokenHash", operator: "eq", value: hashToken(rawToken) }],
    });
    if (!token || token.revokedAt) throw new SecFnForbiddenError("Invalid runtime token");
    if (token.expiresAt && !(Date.parse(token.expiresAt) > Date.now())) {
      throw new SecFnForbiddenError("Runtime token has expired");
    }
    if (token.tenantId && token.tenantId !== scope.tenantId) throw new SecFnForbiddenError("Runtime token tenant mismatch");
    const namespace = scope.namespaceId
      ? await this.ensureNamespace({ ...scope, createdBy: "system", create: false })
      : await this.findNamespace({ tenantId: scope.tenantId, namespace: scope.namespace });
    const environment = scope.environmentId
      ? await this.ensureEnvironment({ ...scope, namespaceId: namespace?.id, createdBy: "system", create: false })
      : undefined;
    if (token.namespace && token.namespace !== (namespace?.slug ?? normalizeSlug(scope.namespace ?? ""))) {
      throw new SecFnForbiddenError("Runtime token namespace mismatch");
    }
    if (token.environment && token.environment !== (environment?.name ?? normalizeName(scope.environment ?? DEFAULT_ENVIRONMENT))) {
      throw new SecFnForbiddenError("Runtime token environment mismatch");
    }
    await this.db.update({
      model: "secfn_service_tokens",
      where: [{ field: "id", operator: "eq", value: token.id }],
      data: { lastUsedAt: nowIso() },
    });
    return { token };
  }

  async readRuntimeSecret(
    key: string,
    verified: VerifiedRuntimeToken,
    scope: SecretScope,
    requestMeta: { ip?: string; userAgent?: string; requestId?: string } = {},
  ): Promise<RuntimeSecretResponse> {
    if (!hasScope(verified.token.scopes, "secret", key)) {
      throw new SecFnForbiddenError("Runtime token cannot read this secret", { key });
    }
    const resolved = await this.resolveScope(scope, { requireNamespace: true, requireEnvironment: true });
    const secret = await this.findSecretByKey(key, resolved);
    if (!secret || secret.revokedAt) throw new SecFnNotFoundError("Secret not found", { key });
    const hydrated = await this.hydrateSecret(secret);
    this.assertRuntimeScope({ ...hydrated, namespace: resolved.namespace }, verified, resolved);
    return this.decryptRuntimeSecret(hydrated, verified, requestMeta);
  }

  async resolveRuntimeSet(
    name: string,
    verified: VerifiedRuntimeToken,
    scope: SecretScope,
    requestMeta: { ip?: string; userAgent?: string; requestId?: string } = {},
  ): Promise<RuntimeSecretSetResponse> {
    if (!hasScope(verified.token.scopes, "set", name)) {
      throw new SecFnForbiddenError("Runtime token cannot read this secret set", { name });
    }
    const resolved = await this.resolveScope(scope, { requireNamespace: true, requireEnvironment: true });
    const set = await this.db.findOne<SecretSetRecord>({
      model: "secfn_secret_sets",
      where: scopeWhere({ tenantId: resolved.tenantId, namespaceId: resolved.namespaceId, name }),
    });
    if (!set) throw new SecFnNotFoundError("Secret set not found", { name });
    const members = await this.db.findMany<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "setId", operator: "eq", value: set.id }],
      limit: 1000,
    });
    const secrets: Record<string, string> = {};
    for (const member of members) {
      const secret = await this.getSecret(member.secretId);
      if (secret.revokedAt) continue;
      this.assertRuntimeScope({ ...secret, namespace: resolved.namespace }, verified, resolved);
      const response = await this.decryptRuntimeSecret(secret, verified, requestMeta);
      secrets[member.alias ?? secret.key] = response.value;
    }
    return { name: set.name, namespace: resolved.namespace, secrets };
  }

  private assertRuntimeScope(secret: SecretRecord, verified: VerifiedRuntimeToken, scope: SecretScope): void {
    const token = verified.token;
    if ((token.tenantId && token.tenantId !== secret.tenantId) ||
        (token.namespace && token.namespace !== secret.namespace) ||
        (token.environment && token.environment !== secret.environment) ||
        (scope.tenantId && scope.tenantId !== secret.tenantId) ||
        (scope.namespaceId && scope.namespaceId !== secret.namespaceId) ||
        (scope.environment && scope.environment !== secret.environment)) {
      throw new SecFnForbiddenError("Runtime token secret scope mismatch");
    }
  }

  private async resolveScope(
    scope: SecretScope,
    options: {
      allowAll?: boolean;
      requireNamespace?: boolean;
      requireEnvironment?: boolean;
      ignoreEnvironment?: boolean;
      create?: boolean;
      actorId?: string;
    } = {},
  ): Promise<SecretScope> {
    const tenantId = scope.tenantId;
    const allNamespace = options.allowAll && isAll(scope.namespace) && !scope.namespaceId;
    const allEnvironment = options.allowAll && isAll(scope.environment) && !scope.environmentId;
    const namespace = allNamespace
      ? undefined
      : await this.ensureNamespace({
        tenantId,
        namespaceId: scope.namespaceId,
        namespace: scope.namespace ?? (options.requireNamespace ? DEFAULT_NAMESPACE : undefined),
        createdBy: options.actorId ?? "system",
        create: options.create || options.requireNamespace,
      });
    if (options.requireNamespace && !namespace) throw new SecFnValidationError("Namespace is required");
    if (options.ignoreEnvironment) {
      return { tenantId, namespaceId: namespace?.id, namespace: namespace?.slug };
    }
    const environment = allEnvironment
      ? undefined
      : await this.ensureEnvironment({
        tenantId,
        namespaceId: namespace?.id,
        environmentId: scope.environmentId,
        environment: scope.environment ?? (options.requireEnvironment ? DEFAULT_ENVIRONMENT : undefined),
        createdBy: options.actorId ?? "system",
        create: options.create || options.requireEnvironment,
      });
    if (options.requireEnvironment && !environment) throw new SecFnValidationError("Environment is required");
    return {
      tenantId,
      namespaceId: namespace?.id,
      namespace: namespace?.slug,
      environmentId: environment?.id,
      environment: environment?.name,
    };
  }

  private async ensureNamespace(input: {
    tenantId?: string;
    namespaceId?: string;
    namespace?: string;
    createdBy: string;
    create?: boolean;
  }): Promise<NamespaceRecord> {
    if (input.namespaceId) {
      const namespace = await this.getNamespace(input.namespaceId);
      if (input.tenantId !== undefined && namespace.tenantId !== input.tenantId) {
        throw new SecFnNotFoundError("Namespace not found");
      }
      return namespace;
    }
    const namespace = input.namespace ? await this.findNamespace(input) : null;
    if (namespace) return namespace;
    if (input.create === false && input.namespace) throw new SecFnNotFoundError("Namespace not found", { namespace: input.namespace });
    return this.createNamespace({
      tenantId: input.tenantId,
      slug: input.namespace ?? DEFAULT_NAMESPACE,
      label: input.namespace ?? DEFAULT_NAMESPACE,
      createdBy: input.createdBy,
    });
  }

  private async ensureEnvironment(input: {
    tenantId?: string;
    namespaceId?: string;
    environmentId?: string;
    environment?: string;
    createdBy: string;
    create?: boolean;
  }): Promise<EnvironmentRecord> {
    if (input.environmentId) {
      const environment = await this.getEnvironment(input.environmentId);
      if ((input.tenantId !== undefined && environment.tenantId !== input.tenantId) ||
          (environment.namespaceId && environment.namespaceId !== input.namespaceId)) {
        throw new SecFnNotFoundError("Environment not found");
      }
      return environment;
    }
    if (input.environment) {
      const existing = await this.findEnvironment(input);
      if (existing) return existing;
      const global = await this.findEnvironment({ ...input, namespaceId: undefined });
      if (global) return global;
      if (input.create === false) throw new SecFnNotFoundError("Environment not found", { environment: input.environment });
    }
    return this.createEnvironment({
      tenantId: input.tenantId,
      name: input.environment ?? DEFAULT_ENVIRONMENT,
      createdBy: input.createdBy,
    });
  }

  private async getNamespace(id: string): Promise<NamespaceRecord> {
    const row = await this.db.findOne<NamespaceRecord>({
      model: "secfn_namespaces",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!row) throw new SecFnNotFoundError("Namespace not found", { id });
    return row;
  }

  private async findNamespace(input: { tenantId?: string; namespace?: string }): Promise<NamespaceRecord | null> {
    const value = normalizeSlug(input.namespace ?? "");
    if (!value) return null;
    const rows = await this.db.findMany<NamespaceRecord>({
      model: "secfn_namespaces",
      where: input.tenantId ? [{ field: "tenantId", operator: "eq", value: input.tenantId }] : [],
      limit: 1000,
    });
    return rows.find((row) => row.slug === value || row.label === input.namespace) ?? null;
  }

  private async getEnvironment(id: string): Promise<EnvironmentRecord> {
    const row = await this.db.findOne<EnvironmentRecord>({
      model: "secfn_environments",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!row) throw new SecFnNotFoundError("Environment not found", { id });
    return row;
  }

  private async findEnvironment(input: { tenantId?: string; namespaceId?: string; environment?: string }): Promise<EnvironmentRecord | null> {
    const name = normalizeName(input.environment ?? "");
    if (!name) return null;
    const where: WhereClause[] = [];
    if (input.tenantId !== undefined) where.push({ field: "tenantId", operator: "eq", value: input.tenantId });
    if (input.namespaceId !== undefined) where.push({ field: "namespaceId", operator: "eq", value: input.namespaceId });
    const rows = await this.db.findMany<EnvironmentRecord>({
      model: "secfn_environments",
      where,
      limit: 1000,
    });
    return rows.find((row) => row.name === name && (input.namespaceId !== undefined ? row.namespaceId === input.namespaceId : !row.namespaceId)) ?? null;
  }

  private async findSecretByKey(key: string, scope: SecretScope): Promise<SecretRecord | null> {
    return this.db.findOne<SecretRecord>({
      model: "secfn_secrets",
      where: scopeWhere({ tenantId: scope.tenantId, namespaceId: scope.namespaceId, environmentId: scope.environmentId, key }),
    });
  }

  private async getSecretRow(id: string): Promise<SecretRecord> {
    const secret = await this.db.findOne<SecretRecord>({
      model: "secfn_secrets",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!secret) throw new SecFnNotFoundError("Secret not found", { id });
    return secret;
  }

  private async getSecretRows(ids: string[]): Promise<Map<string, SecretRecord>> {
    const uniqueIds = uniqueStrings(ids);
    if (uniqueIds.length === 0) return new Map();
    const rows = await this.db.findMany<SecretRecord>({
      model: "secfn_secrets",
      where: [{ field: "id", operator: "in", value: uniqueIds }],
      limit: uniqueIds.length,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async getSecretSetRow(id: string): Promise<SecretSetRecord> {
    const set = await this.db.findOne<SecretSetRecord>({
      model: "secfn_secret_sets",
      where: [{ field: "id", operator: "eq", value: id }],
    });
    if (!set) throw new SecFnNotFoundError("Secret set not found", { id });
    return set;
  }

  private async getNamespaceRows(ids: string[]): Promise<Map<string, NamespaceRecord>> {
    const uniqueIds = uniqueStrings(ids);
    if (uniqueIds.length === 0) return new Map();
    const rows = await this.db.findMany<NamespaceRecord>({
      model: "secfn_namespaces",
      where: [{ field: "id", operator: "in", value: uniqueIds }],
      limit: uniqueIds.length,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async getEnvironmentRows(ids: string[]): Promise<Map<string, EnvironmentRecord>> {
    const uniqueIds = uniqueStrings(ids);
    if (uniqueIds.length === 0) return new Map();
    const rows = await this.db.findMany<EnvironmentRecord>({
      model: "secfn_environments",
      where: [{ field: "id", operator: "in", value: uniqueIds }],
      limit: uniqueIds.length,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async getSecretVersion(secretId: string, version: number): Promise<SecretVersionRecord> {
    const row = await this.db.findOne<SecretVersionRecord>({
      model: "secfn_secret_versions",
      where: [
        { field: "secretId", operator: "eq", value: secretId },
        { field: "version", operator: "eq", value: version },
      ],
    });
    if (!row) throw new SecFnNotFoundError("Secret version not found", { secretId, version });
    return row;
  }

  private async createVersion(secret: SecretRecord, value: string, createdBy: string): Promise<SecretVersionRecord> {
    return {
      id: generateId("version"),
      secretId: secret.id,
      version: secret.currentVersion,
      encryptedPayload: await encryptSecret(
        value,
        this.keyProvider,
        buildSecretAad({
          tenantId: secret.tenantId,
          namespace: secret.namespaceId,
          secretId: secret.id,
          version: secret.currentVersion,
        }),
      ),
      createdBy,
      createdAt: nowIso(),
    };
  }

  private async decryptRuntimeSecret(
    secret: SecretRecord,
    verified: VerifiedRuntimeToken,
    requestMeta: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<RuntimeSecretResponse> {
    const version = await this.getSecretVersion(secret.id, secret.currentVersion);
    const value = await decryptSecret(
      version.encryptedPayload,
      this.keyProvider,
      buildSecretAad({
        tenantId: secret.tenantId,
        namespace: secret.namespaceId,
        secretId: secret.id,
        version: version.version,
      }),
    );
    await this.audit.write({
      type: "secret_accessed",
      severity: "info",
      tenantId: secret.tenantId,
      namespaceId: secret.namespaceId,
      namespace: secret.namespace,
      environmentId: secret.environmentId,
      environment: secret.environment,
      actorId: verified.token.id,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
      resource: `secret:${secret.key}`,
      action: "read",
      metadata: { tokenId: verified.token.id, version: version.version },
    });
    return { key: secret.key, value, environment: secret.environment, version: version.version };
  }

  private async hydrateSecrets(rows: SecretRecord[]): Promise<SecretRecord[]> {
    const [namespaces, environments] = await Promise.all([
      this.getNamespaceRows(rows.map((row) => row.namespaceId)),
      this.getEnvironmentRows(rows.map((row) => row.environmentId)),
    ]);
    return rows.map((row) => this.hydrateSecretFromMaps(row, namespaces, environments));
  }

  private async hydrateSecret(row: SecretRecord): Promise<SecretRecord> {
    const [namespace, environment] = await Promise.all([
      this.getNamespace(row.namespaceId).catch(() => null),
      this.getEnvironment(row.environmentId).catch(() => null),
    ]);
    return this.applySecretLabels(row, namespace, environment);
  }

  private hydrateSecretFromMaps(
    row: SecretRecord,
    namespaces: Map<string, NamespaceRecord>,
    environments: Map<string, EnvironmentRecord>,
  ): SecretRecord {
    return this.applySecretLabels(row, namespaces.get(row.namespaceId) ?? null, environments.get(row.environmentId) ?? null);
  }

  private applySecretLabels(
    row: SecretRecord,
    namespace: NamespaceRecord | null,
    environment: EnvironmentRecord | null,
  ): SecretRecord {
    return {
      ...row,
      namespace: namespace?.label ?? namespace?.slug ?? row.namespace,
      environment: environment?.name ?? row.environment,
    };
  }

  private async hydrateSets(rows: SecretSetRecord[]): Promise<SecretSetRecord[]> {
    const namespaces = await this.getNamespaceRows(rows.map((row) => row.namespaceId));
    return rows.map((row) => this.hydrateSetFromMap(row, namespaces));
  }

  private async hydrateSet(row: SecretSetRecord): Promise<SecretSetRecord> {
    const namespace = await this.getNamespace(row.namespaceId).catch(() => null);
    return this.applySetLabels(row, namespace);
  }

  private hydrateSetFromMap(row: SecretSetRecord, namespaces: Map<string, NamespaceRecord>): SecretSetRecord {
    return this.applySetLabels(row, namespaces.get(row.namespaceId) ?? null);
  }

  private applySetLabels(row: SecretSetRecord, namespace: NamespaceRecord | null): SecretSetRecord {
    return {
      ...row,
      namespace: namespace?.label ?? namespace?.slug ?? row.namespace,
    };
  }

  private async assertUniqueSetOutputName(
    setId: string,
    next: { secretId: string; alias?: string | null; memberId?: string },
    nextSecret?: SecretRecord,
  ): Promise<void> {
    const members = await this.db.findMany<SecretSetMemberRecord>({
      model: "secfn_secret_set_members",
      where: [{ field: "setId", operator: "eq", value: setId }],
      limit: 1000,
    });
    const secrets = await this.getSecretRows([
      next.secretId,
      ...members.map((member) => member.secretId),
    ]);
    const resolvedNextSecret = nextSecret ?? secrets.get(next.secretId);
    if (!resolvedNextSecret) throw new SecFnNotFoundError("Secret not found", { id: next.secretId });
    const nextName = cleanString(next.alias ?? undefined) ?? resolvedNextSecret.key;
    for (const member of members) {
      if (member.id === next.memberId) continue;
      const secret = secrets.get(member.secretId);
      if (!secret) continue;
      const name = member.alias ?? secret.key;
      if (name === nextName) {
        if (!cleanString(next.alias ?? undefined)) {
          throw new SecFnValidationError("Alias is required when a set already contains this output name", { outputName: nextName });
        }
        throw new SecFnValidationError("Secret set output names must be unique", { outputName: nextName });
      }
    }
  }
}

function hasScope(scopes: string[], kind: "secret" | "set", name: string): boolean {
  return scopes.includes("*") || scopes.includes(`${kind}:*`) || scopes.includes(`${kind}:${name}`);
}

function cleanString(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  let start = 0; let end = slug.length;
  while (start < end && slug[start] === "-") start++;
  while (end > start && slug[end - 1] === "-") end--;
  return slug.slice(start, end);
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeName(value: string): string {
  return value.trim();
}

function isAll(value: string | undefined): boolean {
  return value === undefined || value === "" || value.toLowerCase() === "all";
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function encodeCursor(row: SecretRecord): string {
  return `${row.updatedAt}|${row.id}`;
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  const [updatedAt = "", id = ""] = cursor.split("|");
  return { updatedAt, id };
}

function compareCursor(row: SecretRecord, cursor: { updatedAt: string; id: string }): number {
  if (row.updatedAt < cursor.updatedAt) return 1;
  if (row.updatedAt > cursor.updatedAt) return -1;
  if (row.id < cursor.id) return 1;
  if (row.id > cursor.id) return -1;
  return 0;
}

function formatDotEnv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${quoteDotEnvValue(value)}`)
    .join("\n");
}

function quoteDotEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
