export function tenantMatches(
  connectionTenantId: string | undefined,
  actorTenantId: string | undefined
): boolean {
  return connectionTenantId === actorTenantId;
}

export function hasAny(values: unknown, candidates: readonly string[]): boolean {
  if (!Array.isArray(values) || values.length === 0) {
    return false;
  }

  const valueSet = new Set(values.filter((value): value is string => typeof value === 'string'));
  return candidates.some((candidate) => valueSet.has(candidate));
}
