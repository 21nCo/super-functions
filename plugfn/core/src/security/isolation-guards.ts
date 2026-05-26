export interface TenantUserScope {
  tenantId: string;
  userId: string;
}

export interface ScopedRecord {
  tenantId: string;
  userId: string;
}

export class SecurityIsolationError extends Error {
  readonly code: 'TENANT_ACCESS_DENIED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'TENANT_ACCESS_DENIED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'SecurityIsolationError';
    this.code = code;
    this.status = code === 'TENANT_ACCESS_DENIED' ? 403 : 400;
  }
}

export function assertValidScope(scope: TenantUserScope): void {
  if (!scope.tenantId || scope.tenantId.trim().length === 0) {
    throw new SecurityIsolationError('VALIDATION_ERROR', 'tenantId is required');
  }
  if (!scope.userId || scope.userId.trim().length === 0) {
    throw new SecurityIsolationError('VALIDATION_ERROR', 'userId is required');
  }
}

export function assertScopedAccess(scope: TenantUserScope, record: ScopedRecord): void {
  assertValidScope(scope);
  if (scope.tenantId !== record.tenantId || scope.userId !== record.userId) {
    throw new SecurityIsolationError('TENANT_ACCESS_DENIED', 'cross-tenant access denied');
  }
}

export function filterScopedRecords<T extends ScopedRecord>(
  records: T[],
  scope: TenantUserScope
): T[] {
  assertValidScope(scope);
  return records.filter((record) => record.tenantId === scope.tenantId && record.userId === scope.userId);
}

export function getScopedRecordById<T extends ScopedRecord & { id: string }>(
  records: T[],
  id: string,
  scope: TenantUserScope
): T | null {
  assertValidScope(scope);
  const direct = records.find(
    (record) => record.id === id && record.tenantId === scope.tenantId && record.userId === scope.userId
  );
  if (direct) {
    return direct;
  }

  const existsCrossTenant = records.some((record) => record.id === id);
  if (existsCrossTenant) {
    throw new SecurityIsolationError('TENANT_ACCESS_DENIED', 'cross-tenant access denied');
  }
  return null;
}
