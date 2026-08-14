import type { PlugFnConnectionOperation, PlugFnPrincipal } from '../types/config.js';
import type { Connection } from '../types/connection.js';

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

export function connectionMatchesActor(
  connection: Connection,
  actor: PlugFnPrincipal,
  operation?: PlugFnConnectionOperation
): boolean {
  if (!tenantMatches(connection.tenantId, actor.tenantId)) {
    return false;
  }

  if (
    connection.userId === actor.userId ||
    (connection.ownerKind === 'user' && connection.ownerId === actor.userId)
  ) {
    return true;
  }

  if (connection.ownerKind === 'organization') {
    return (
      connection.installedByUserId === actor.userId ||
      (Boolean(connection.organizationId) &&
        Boolean(actor.organizationId) &&
        connection.organizationId === actor.organizationId &&
        hasAny(actor.roles, ['admin', 'owner', 'org:admin']))
    );
  }

  if (connection.ownerKind !== 'delegated') {
    return false;
  }

  if (connection.installedByUserId === actor.userId) {
    return true;
  }

  const allowedGrants = connection.grants ?? [];
  const operationGrants =
    operation === 'disconnect' ? ['disconnect', 'revoke'] : operation ? [operation] : allowedGrants;
  const operationAllowed = hasAny(allowedGrants, operationGrants);

  if (connection.delegatedToUserId === actor.userId) {
    return operationAllowed;
  }

  return operationAllowed && hasAny(actor.grants, operationGrants);
}
