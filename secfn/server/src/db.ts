import type { Adapter, WhereClause } from "@superfunctions/db";

export function scopeWhere(input: {
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  environmentId?: string;
  environment?: string;
  key?: string;
  name?: string;
}): WhereClause[] {
  const where: WhereClause[] = [];
  if (input.tenantId !== undefined) where.push({ field: "tenantId", operator: "eq", value: input.tenantId });
  if (input.namespaceId !== undefined) where.push({ field: "namespaceId", operator: "eq", value: input.namespaceId });
  if (input.namespace !== undefined) where.push({ field: "namespace", operator: "eq", value: input.namespace });
  if (input.environmentId !== undefined) where.push({ field: "environmentId", operator: "eq", value: input.environmentId });
  if (input.environment !== undefined) where.push({ field: "environment", operator: "eq", value: input.environment });
  if (input.key !== undefined) where.push({ field: "key", operator: "eq", value: input.key });
  if (input.name !== undefined) where.push({ field: "name", operator: "eq", value: input.name });
  return where;
}

export async function findOneRequired<T>(
  db: Adapter,
  model: string,
  where: WhereClause[],
): Promise<T | null> {
  return db.findOne<T>({ model, where });
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const clone = { ...value };
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}
