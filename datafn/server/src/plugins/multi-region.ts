import type { DatafnPlugin } from '@datafn/core';
import type { IndexedDirectoryRecord, IndexedDirectoryStoreAdapter } from '@superfunctions/db';

export interface DatafnMultiRegionDirectory {
  store: IndexedDirectoryStoreAdapter;
}

export interface DatafnMultiRegionPluginConfig {
  regionId: string;
  directory: IndexedDirectoryStoreAdapter | DatafnMultiRegionDirectory;
}

export interface DatafnMultiRegionRuntimeConfig {
  regionId: string;
  directory: IndexedDirectoryStoreAdapter;
}

export interface DatafnPermissionDirectoryGrant {
  id: string;
  resourceType: string;
  resourceNs: string;
  resourceId: string | null;
  principalId: string;
  level?: string;
  grantKind?: string;
  sourceRef?: unknown;
  grantedBy?: string;
  grantedAt?: number;
  revokedAt?: number | null;
  resourceRegion: string;
}

let runtimeConfig: DatafnMultiRegionRuntimeConfig | null = null;

export function datafnMultiRegionPlugin(
  config: DatafnMultiRegionPluginConfig,
): DatafnPlugin & DatafnMultiRegionRuntimeConfig {
  const runtime = {
    regionId: config.regionId,
    directory: resolveDirectory(config.directory),
  };
  setDatafnMultiRegionRuntimeConfig(runtime);
  return {
    name: 'datafn-multi-region',
    runsOn: ['server'],
    ...runtime,
  };
}

export const createDatafnMultiRegionPlugin = datafnMultiRegionPlugin;

export function setDatafnMultiRegionRuntimeConfig(config: DatafnMultiRegionRuntimeConfig | null): void {
  runtimeConfig = config;
}

export function getDatafnMultiRegionRuntimeConfig(): DatafnMultiRegionRuntimeConfig | null {
  return runtimeConfig;
}

export async function indexDatafnPermissionGrant(
  grant: Record<string, unknown>,
): Promise<void> {
  const config = getDatafnMultiRegionRuntimeConfig();
  const normalized = normalizeGrant(grant, config?.regionId);
  if (!config || !normalized) return;
  await config.directory.put(permissionGrantRecord(normalized));
}

export async function deleteDatafnPermissionGrant(
  input: {
    id: string;
    resourceType: string;
    resourceNs: string;
    resourceId: string | null;
    principalId: string;
  },
): Promise<void> {
  const config = getDatafnMultiRegionRuntimeConfig();
  if (!config) return;
  await config.directory.delete(permissionDirectoryKey(input.id));
}

export async function queryDatafnPermissionGrants(
  input: {
    principalId: string;
    resourceType: string;
  },
): Promise<DatafnPermissionDirectoryGrant[]> {
  const config = getDatafnMultiRegionRuntimeConfig();
  if (!config) return [];
  const result = await config.directory.query({
    index: 'datafn.permission.principalResource',
    value: `${input.principalId}#${input.resourceType}`,
  });
  return result.records
    .map((record) => parseGrant(record.value))
    .filter((grant): grant is DatafnPermissionDirectoryGrant => Boolean(grant));
}

function resolveDirectory(
  directory: IndexedDirectoryStoreAdapter | DatafnMultiRegionDirectory,
): IndexedDirectoryStoreAdapter {
  return 'store' in directory ? directory.store : directory;
}

function normalizeGrant(
  grant: Record<string, unknown>,
  regionId: string | undefined,
): DatafnPermissionDirectoryGrant | null {
  const id = typeof grant.id === 'string' ? grant.id : null;
  const resourceType = typeof grant.resourceType === 'string' ? grant.resourceType : null;
  const resourceNs = typeof grant.resourceNs === 'string' ? grant.resourceNs : null;
  const principalId = typeof grant.principalId === 'string' ? grant.principalId : null;
  if (!id || !resourceType || !resourceNs || !principalId || !regionId) return null;
  return {
    id,
    resourceType,
    resourceNs,
    resourceId: typeof grant.resourceId === 'string' ? grant.resourceId : null,
    principalId,
    level: typeof grant.level === 'string' ? grant.level : undefined,
    grantKind: typeof grant.grantKind === 'string' ? grant.grantKind : undefined,
    sourceRef: grant.sourceRef,
    grantedBy: typeof grant.grantedBy === 'string' ? grant.grantedBy : undefined,
    grantedAt: typeof grant.grantedAt === 'number' ? grant.grantedAt : undefined,
    revokedAt: typeof grant.revokedAt === 'number' || grant.revokedAt === null ? grant.revokedAt : undefined,
    resourceRegion: regionId,
  };
}

function permissionGrantRecord(grant: DatafnPermissionDirectoryGrant): IndexedDirectoryRecord {
  return {
    key: permissionDirectoryKey(grant.id),
    value: JSON.stringify(grant),
    indexes: {
      'datafn.permission.principal': grant.principalId,
      'datafn.permission.principalResource': `${grant.principalId}#${grant.resourceType}`,
      'datafn.permission.resource': `${grant.resourceRegion}#${grant.resourceNs}#${grant.resourceType}#${grant.resourceId ?? '*'}`,
      'datafn.permission.region': grant.resourceRegion,
    },
  };
}

function parseGrant(value: string): DatafnPermissionDirectoryGrant | null {
  try {
    const parsed = JSON.parse(value) as Partial<DatafnPermissionDirectoryGrant>;
    return typeof parsed.id === 'string'
      && typeof parsed.resourceType === 'string'
      && typeof parsed.resourceNs === 'string'
      && typeof parsed.principalId === 'string'
      && typeof parsed.resourceRegion === 'string'
      ? {
          id: parsed.id,
          resourceType: parsed.resourceType,
          resourceNs: parsed.resourceNs,
          resourceId: typeof parsed.resourceId === 'string' ? parsed.resourceId : null,
          principalId: parsed.principalId,
          level: typeof parsed.level === 'string' ? parsed.level : undefined,
          grantKind: typeof parsed.grantKind === 'string' ? parsed.grantKind : undefined,
          sourceRef: parsed.sourceRef,
          grantedBy: typeof parsed.grantedBy === 'string' ? parsed.grantedBy : undefined,
          grantedAt: typeof parsed.grantedAt === 'number' ? parsed.grantedAt : undefined,
          revokedAt: typeof parsed.revokedAt === 'number' || parsed.revokedAt === null ? parsed.revokedAt : undefined,
          resourceRegion: parsed.resourceRegion,
        }
      : null;
  } catch {
    return null;
  }
}

function permissionDirectoryKey(id: string): string {
  return `datafn:permission:${id}`;
}
