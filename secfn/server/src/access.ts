import type { Adapter, WhereClause } from "@superfunctions/db";
import { generateId, nowIso } from "@secfn/core";
import type { RoleBindingRecord, RoleRecord } from "@secfn/core";

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
  inherits?: string[];
  metadata?: Record<string, unknown>;
}

export interface AssignRoleInput {
  principalId: string;
  roleId: string;
  tenantId?: string;
  namespace?: string;
  resourceId?: string;
  expiresAt?: string;
  createdBy?: string;
}

export interface AccessCheckInput {
  principalId: string;
  action: string;
  tenantId?: string;
  namespace?: string;
  resourceId?: string;
}

export class AccessService {
  private readonly cache = new Map<string, { allowed: boolean; expiresAt: number }>();

  constructor(private readonly db: Adapter, private readonly cacheTtlMs = 300_000) {}

  async createRole(input: CreateRoleInput): Promise<RoleRecord> {
    const role: RoleRecord = {
      id: generateId("role"),
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      inherits: input.inherits,
      metadata: input.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.db.create({ model: "secfn_roles", data: role as unknown as Record<string, unknown> });
    this.cache.clear();
    return role;
  }

  async assignRole(input: AssignRoleInput): Promise<RoleBindingRecord> {
    const binding: RoleBindingRecord = {
      id: generateId("binding"),
      principalId: input.principalId,
      roleId: input.roleId,
      tenantId: input.tenantId,
      namespace: input.namespace,
      resourceId: input.resourceId,
      expiresAt: input.expiresAt,
      createdAt: nowIso(),
      createdBy: input.createdBy,
    };
    await this.db.create({ model: "secfn_role_bindings", data: binding as unknown as Record<string, unknown> });
    this.cache.clear();
    return binding;
  }

  async check(input: AccessCheckInput): Promise<boolean> {
    const cacheKey = JSON.stringify(input);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.allowed;

    const bindings = await this.findBindings(input);
    const roles = new Map<string, RoleRecord>();
    let cacheExpiresAt = Date.now() + this.cacheTtlMs;
    for (const binding of bindings) {
      if (binding.expiresAt) {
        const expiresAt = Date.parse(binding.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue;
        cacheExpiresAt = Math.min(cacheExpiresAt, expiresAt);
      }
      const role = await this.db.findOne<RoleRecord>({
        model: "secfn_roles",
        where: [{ field: "id", operator: "eq", value: binding.roleId }],
      });
      if (role) roles.set(role.id, role);
    }

    const permissions = new Set<string>();
    for (const role of roles.values()) {
      await this.collectPermissions(role, permissions, new Set());
    }

    const allowed = Array.from(permissions).some((permission) =>
      matchesPermission(permission, input.action),
    );
    this.cache.set(cacheKey, { allowed, expiresAt: cacheExpiresAt });
    return allowed;
  }

  async getUserPermissions(principalId: string): Promise<string[]> {
    const bindings = await this.db.findMany<RoleBindingRecord>({
      model: "secfn_role_bindings",
      where: [{ field: "principalId", operator: "eq", value: principalId }],
    });
    const permissions = new Set<string>();
    for (const binding of bindings) {
      const role = await this.db.findOne<RoleRecord>({
        model: "secfn_roles",
        where: [{ field: "id", operator: "eq", value: binding.roleId }],
      });
      if (role) await this.collectPermissions(role, permissions, new Set());
    }
    return Array.from(permissions);
  }

  private async findBindings(input: AccessCheckInput): Promise<RoleBindingRecord[]> {
    const where: WhereClause[] = [
      { field: "principalId", operator: "eq", value: input.principalId },
    ];
    const bindings = await this.db.findMany<RoleBindingRecord>({
      model: "secfn_role_bindings",
      where,
    });
    return bindings.filter((binding) => {
      if (binding.tenantId && binding.tenantId !== input.tenantId) return false;
      if (binding.namespace && binding.namespace !== input.namespace) return false;
      if (binding.resourceId && binding.resourceId !== input.resourceId) return false;
      return true;
    });
  }

  private async collectPermissions(
    role: RoleRecord,
    permissions: Set<string>,
    seen: Set<string>,
  ): Promise<void> {
    if (seen.has(role.id)) return;
    seen.add(role.id);
    for (const permission of role.permissions) permissions.add(permission);
    for (const inheritedId of role.inherits ?? []) {
      const inherited = await this.db.findOne<RoleRecord>({
        model: "secfn_roles",
        where: [{ field: "id", operator: "eq", value: inheritedId }],
      });
      if (inherited) await this.collectPermissions(inherited, permissions, seen);
    }
  }
}

export function matchesPermission(permission: string, action: string): boolean {
  if (permission === "*" || permission === "*:*") return true;
  const permissionParts = permission.split(":");
  const actionParts = action.split(":");
  if (permissionParts.length !== actionParts.length) return false;
  return permissionParts.every((part, index) => part === "*" || part === actionParts[index]);
}
