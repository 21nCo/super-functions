import { assertValidScope, type TenantUserScope } from './isolation-guards.js';

export type RetentionDataset = 'connections' | 'tokens' | 'messages' | 'parseArtifacts';

export interface RetentionArtifact {
  id: string;
  tenantId: string;
  userId: string;
  dataset: RetentionDataset;
  createdAt: string;
  expiresAt?: string;
  legalHoldId?: string;
}

export interface RetentionPolicy {
  defaultTtlDays: number;
  datasetTtlDays?: Partial<Record<RetentionDataset, number>>;
}

export interface RetentionSweepResult {
  scanned: number;
  deleted: number;
  retained: number;
  deletedIds: string[];
  deletedByDataset: Record<RetentionDataset, number>;
}

export interface RetentionArtifactRepository {
  listByScope(scope: TenantUserScope): Promise<RetentionArtifact[]>;
  deleteByIds(ids: string[]): Promise<void>;
}

export class RetentionPolicyError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RetentionPolicyError';
  }
}

const RETENTION_DATASETS: RetentionDataset[] = ['connections', 'tokens', 'messages', 'parseArtifacts'];

export function resolveRetentionExpiry(artifact: RetentionArtifact, policy: RetentionPolicy): string {
  validatePolicy(policy);

  if (artifact.expiresAt) {
    assertIsoTimestamp(artifact.expiresAt, 'expiresAt');
    return artifact.expiresAt;
  }

  assertIsoTimestamp(artifact.createdAt, 'createdAt');
  const ttlDays = resolveTtlDays(policy, artifact.dataset);
  const createdAt = new Date(artifact.createdAt).getTime();
  return new Date(createdAt + ttlDays * 86400000).toISOString();
}

export function shouldDeleteArtifactByPolicy(
  artifact: RetentionArtifact,
  policy: RetentionPolicy,
  nowIso = new Date().toISOString()
): boolean {
  if (artifact.legalHoldId && artifact.legalHoldId.trim().length > 0) {
    return false;
  }

  assertIsoTimestamp(nowIso, 'nowIso');
  const expiresAt = resolveRetentionExpiry(artifact, policy);
  return Date.parse(expiresAt) <= Date.parse(nowIso);
}

export function runRetentionSweep(input: {
  scope: TenantUserScope;
  artifacts: RetentionArtifact[];
  policy: RetentionPolicy;
  nowIso?: string;
}): {
  remaining: RetentionArtifact[];
  deleted: RetentionArtifact[];
  result: RetentionSweepResult;
} {
  assertValidScope(input.scope);
  validatePolicy(input.policy);
  const nowIso = input.nowIso ?? new Date().toISOString();
  assertIsoTimestamp(nowIso, 'nowIso');

  const scoped = input.artifacts.filter(
    (artifact) => artifact.tenantId === input.scope.tenantId && artifact.userId === input.scope.userId
  );

  const unscoped = input.artifacts.filter(
    (artifact) => artifact.tenantId !== input.scope.tenantId || artifact.userId !== input.scope.userId
  );

  const deleted: RetentionArtifact[] = [];
  const retainedScoped: RetentionArtifact[] = [];
  const deletedByDataset: Record<RetentionDataset, number> = {
    connections: 0,
    tokens: 0,
    messages: 0,
    parseArtifacts: 0,
  };

  for (const artifact of scoped) {
    if (shouldDeleteArtifactByPolicy(artifact, input.policy, nowIso)) {
      deleted.push(artifact);
      deletedByDataset[artifact.dataset] += 1;
      continue;
    }
    retainedScoped.push(artifact);
  }

  const remaining = [...unscoped, ...retainedScoped];

  return {
    remaining,
    deleted,
    result: {
      scanned: scoped.length,
      deleted: deleted.length,
      retained: retainedScoped.length,
      deletedIds: deleted.map((artifact) => artifact.id),
      deletedByDataset,
    },
  };
}

export async function executeRetentionSweep(
  repository: RetentionArtifactRepository,
  scope: TenantUserScope,
  policy: RetentionPolicy,
  nowIso?: string
): Promise<RetentionSweepResult> {
  assertValidScope(scope);
  validatePolicy(policy);

  const artifacts = await repository.listByScope(scope);
  const sweep = runRetentionSweep({
    scope,
    artifacts,
    policy,
    nowIso,
  });

  if (sweep.result.deletedIds.length > 0) {
    await repository.deleteByIds(sweep.result.deletedIds);
  }

  return sweep.result;
}

export class InMemoryRetentionArtifactRepository implements RetentionArtifactRepository {
  private artifacts: RetentionArtifact[];

  constructor(seed: RetentionArtifact[] = []) {
    this.artifacts = [...seed];
  }

  async listByScope(scope: TenantUserScope): Promise<RetentionArtifact[]> {
    assertValidScope(scope);
    return this.artifacts.filter(
      (artifact) => artifact.tenantId === scope.tenantId && artifact.userId === scope.userId
    );
  }

  async deleteByIds(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    this.artifacts = this.artifacts.filter((artifact) => !idSet.has(artifact.id));
  }

  listAll(): RetentionArtifact[] {
    return [...this.artifacts];
  }
}

function validatePolicy(policy: RetentionPolicy): void {
  if (!Number.isFinite(policy.defaultTtlDays) || policy.defaultTtlDays <= 0) {
    throw new RetentionPolicyError('defaultTtlDays must be a positive number');
  }

  if (!policy.datasetTtlDays) {
    return;
  }

  for (const dataset of RETENTION_DATASETS) {
    const value = policy.datasetTtlDays[dataset];
    if (value === undefined) {
      continue;
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new RetentionPolicyError(`dataset ttl for ${dataset} must be a positive number`);
    }
  }
}

function resolveTtlDays(policy: RetentionPolicy, dataset: RetentionDataset): number {
  const datasetValue = policy.datasetTtlDays?.[dataset];
  if (datasetValue !== undefined) {
    return datasetValue;
  }
  return policy.defaultTtlDays;
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new RetentionPolicyError(`${field} must be an ISO timestamp`);
  }
}
