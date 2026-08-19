import { assertValidScope, filterScopedRecords, type TenantUserScope } from './isolation-guards.js';

export interface UserScopedLifecycleRecord {
  id: string;
  tenantId: string;
  userId: string;
  [key: string]: unknown;
}

export interface LifecycleStore {
  listConnections(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]>;
  listTokens(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]>;
  listMessages(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]>;
  listParseArtifacts(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]>;
  deleteConnections(scope: TenantUserScope): Promise<number>;
  deleteTokens(scope: TenantUserScope): Promise<number>;
  deleteMessages(scope: TenantUserScope): Promise<number>;
  deleteParseArtifacts(scope: TenantUserScope): Promise<number>;
}

export interface UserLifecycleExport {
  format: 'plugfn.user-export.v1';
  exportedAt: string;
  tenantId: string;
  userId: string;
  connections: UserScopedLifecycleRecord[];
  tokens: UserScopedLifecycleRecord[];
  messages: UserScopedLifecycleRecord[];
  parseArtifacts: UserScopedLifecycleRecord[];
}

export interface UserLifecycleDeleteResult {
  connections: boolean;
  tokens: boolean;
  messages: boolean;
  parseArtifacts: boolean;
}

export interface UserLifecycleOperationResult {
  exported: boolean;
  payload: UserLifecycleExport;
  deleted: UserLifecycleDeleteResult;
}

export class LifecycleSecurityError extends Error {
  readonly code: 'INTERNAL_ERROR' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'INTERNAL_ERROR' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'LifecycleSecurityError';
    this.code = code;
    this.status = code === 'VALIDATION_ERROR' ? 400 : 500;
  }
}

type LifecycleDataset = 'connections' | 'tokens' | 'messages' | 'parseArtifacts';

const DATASET_ORDER: LifecycleDataset[] = ['parseArtifacts', 'messages', 'tokens', 'connections'];

const RESIDUAL_ERROR_LABELS: Record<LifecycleDataset, string> = {
  connections: 'connections',
  tokens: 'token_vault_records',
  messages: 'mail_messages',
  parseArtifacts: 'mail_parse_results',
};

export async function exportUserScopedData(
  scope: TenantUserScope,
  store: LifecycleStore,
  nowIso = new Date().toISOString()
): Promise<UserLifecycleExport> {
  assertValidScope(scope);

  const [connections, tokens, messages, parseArtifacts] = await Promise.all([
    store.listConnections(scope),
    store.listTokens(scope),
    store.listMessages(scope),
    store.listParseArtifacts(scope),
  ]);

  return {
    format: 'plugfn.user-export.v1',
    exportedAt: nowIso,
    tenantId: scope.tenantId,
    userId: scope.userId,
    connections: cloneScopedRecords(connections, scope),
    tokens: cloneScopedRecords(tokens, scope),
    messages: cloneScopedRecords(messages, scope),
    parseArtifacts: cloneScopedRecords(parseArtifacts, scope),
  };
}

export async function deleteUserScopedData(
  scope: TenantUserScope,
  store: LifecycleStore
): Promise<UserLifecycleDeleteResult> {
  assertValidScope(scope);

  for (const dataset of DATASET_ORDER) {
    await deleteDataset(dataset, scope, store);
  }

  const residual = await readDatasets(scope, store);
  const residualDataset = DATASET_ORDER.find((dataset) => residual[dataset].length > 0);

  if (residualDataset) {
    throw new LifecycleSecurityError(
      'INTERNAL_ERROR',
      `deletion incomplete: ${RESIDUAL_ERROR_LABELS[residualDataset]}`
    );
  }

  return {
    connections: true,
    tokens: true,
    messages: true,
    parseArtifacts: true,
  };
}

export async function exportAndDeleteUserScopedData(
  scope: TenantUserScope,
  store: LifecycleStore,
  nowIso?: string
): Promise<UserLifecycleOperationResult> {
  const payload = await exportUserScopedData(scope, store, nowIso);
  const deleted = await deleteUserScopedData(scope, store);
  return {
    exported: true,
    payload,
    deleted,
  };
}

export interface InMemoryLifecycleStoreSeed {
  connections?: UserScopedLifecycleRecord[];
  tokens?: UserScopedLifecycleRecord[];
  messages?: UserScopedLifecycleRecord[];
  parseArtifacts?: UserScopedLifecycleRecord[];
}

export class InMemoryLifecycleStore implements LifecycleStore {
  private readonly records: Record<LifecycleDataset, UserScopedLifecycleRecord[]>;
  private readonly residualDatasets = new Set<LifecycleDataset>();

  constructor(seed: InMemoryLifecycleStoreSeed = {}) {
    this.records = {
      connections: [...(seed.connections ?? [])],
      tokens: [...(seed.tokens ?? [])],
      messages: [...(seed.messages ?? [])],
      parseArtifacts: [...(seed.parseArtifacts ?? [])],
    };
  }

  setResidualDataset(dataset: LifecycleDataset, enabled: boolean): void {
    if (enabled) {
      this.residualDatasets.add(dataset);
      return;
    }
    this.residualDatasets.delete(dataset);
  }

  async listConnections(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]> {
    return cloneScopedRecords(this.records.connections, scope);
  }

  async listTokens(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]> {
    return cloneScopedRecords(this.records.tokens, scope);
  }

  async listMessages(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]> {
    return cloneScopedRecords(this.records.messages, scope);
  }

  async listParseArtifacts(scope: TenantUserScope): Promise<UserScopedLifecycleRecord[]> {
    return cloneScopedRecords(this.records.parseArtifacts, scope);
  }

  async deleteConnections(scope: TenantUserScope): Promise<number> {
    return this.deleteDatasetRecords('connections', scope);
  }

  async deleteTokens(scope: TenantUserScope): Promise<number> {
    return this.deleteDatasetRecords('tokens', scope);
  }

  async deleteMessages(scope: TenantUserScope): Promise<number> {
    return this.deleteDatasetRecords('messages', scope);
  }

  async deleteParseArtifacts(scope: TenantUserScope): Promise<number> {
    return this.deleteDatasetRecords('parseArtifacts', scope);
  }

  private deleteDatasetRecords(dataset: LifecycleDataset, scope: TenantUserScope): number {
    assertValidScope(scope);

    let keptResidual = false;
    let deleted = 0;
    const next: UserScopedLifecycleRecord[] = [];

    for (const record of this.records[dataset]) {
      const inScope = record.tenantId === scope.tenantId && record.userId === scope.userId;
      if (!inScope) {
        next.push(record);
        continue;
      }

      if (this.residualDatasets.has(dataset) && !keptResidual) {
        keptResidual = true;
        next.push(record);
        continue;
      }

      deleted += 1;
    }

    this.records[dataset] = next;
    return deleted;
  }
}

function cloneScopedRecords(
  records: UserScopedLifecycleRecord[],
  scope: TenantUserScope
): UserScopedLifecycleRecord[] {
  return filterScopedRecords(records, scope).map((record) => ({ ...record }));
}

async function readDatasets(
  scope: TenantUserScope,
  store: LifecycleStore
): Promise<Record<LifecycleDataset, UserScopedLifecycleRecord[]>> {
  const [connections, tokens, messages, parseArtifacts] = await Promise.all([
    store.listConnections(scope),
    store.listTokens(scope),
    store.listMessages(scope),
    store.listParseArtifacts(scope),
  ]);

  return {
    connections,
    tokens,
    messages,
    parseArtifacts,
  };
}

async function deleteDataset(
  dataset: LifecycleDataset,
  scope: TenantUserScope,
  store: LifecycleStore
): Promise<void> {
  switch (dataset) {
    case 'connections':
      await store.deleteConnections(scope);
      return;
    case 'tokens':
      await store.deleteTokens(scope);
      return;
    case 'messages':
      await store.deleteMessages(scope);
      return;
    case 'parseArtifacts':
      await store.deleteParseArtifacts(scope);
      return;
    default:
      throw new LifecycleSecurityError('VALIDATION_ERROR', `unsupported dataset: ${dataset satisfies never}`);
  }
}
