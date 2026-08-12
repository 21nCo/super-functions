export function tenantMatches(
  connectionTenantId: string | undefined,
  actorTenantId: string | undefined
): boolean {
  return !connectionTenantId || !actorTenantId || connectionTenantId === actorTenantId;
}
