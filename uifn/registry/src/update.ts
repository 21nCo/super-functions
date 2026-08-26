import { buildRegistry } from './build-registry';
import { diffInstalled, type DiffEntry } from './diff';
import { readLockFile } from './lockfile';
import { planInstall, type RegistryInstallPlan } from './plan';
import { commitTransaction } from './transaction';

export interface UpdateOptions {
  rootDir: string;
  lockKeys?: string[];
  dryRun?: boolean;
  faultAfterWrites?: number;
  registryRoot?: string;
}

export interface UpdateResult {
  ok: boolean;
  dryRun: boolean;
  updated: string[];
  plan?: Omit<RegistryInstallPlan, 'rootDir' | 'changes'>;
  rolledBack?: boolean;
  errors: Array<{ code: string; message: string; path?: string; conflicts?: DiffEntry[] | unknown[] }>;
}

export function updateInstalled(options: UpdateOptions): UpdateResult {
  const registry = buildRegistry();
  const lockfile = readLockFile(options.rootDir, { catalogSha256: registry.trust.catalogSha256, signatureKeyId: registry.trust.keyId });
  const requestedKeys = (options.lockKeys ?? Object.keys(lockfile.items))
    .map((value) => value.includes(':') ? value : `component:${value}`);
  if (options.lockKeys) {
    const missing = requestedKeys.filter((key) => !lockfile.items[key]);
    if (missing.length) return { ok: false, dryRun: Boolean(options.dryRun), updated: [], errors: [{ code: 'UIFN_REGISTRY_ARTIFACT_NOT_INSTALLED', message: `Not installed: ${missing.join(', ')}` }] };
  }
  const entries = requestedKeys.map((key) => [key, lockfile.items[key]] as const).filter((pair): pair is readonly [string, NonNullable<typeof pair[1]>] => Boolean(pair[1]));
  if (!entries.length) return { ok: true, dryRun: Boolean(options.dryRun), updated: [], errors: [] };
  const frameworks = new Set(entries.map(([, entry]) => entry.framework));
  if (frameworks.size !== 1) return { ok: false, dryRun: Boolean(options.dryRun), updated: [], errors: [{ code: 'UIFN_REGISTRY_FRAMEWORK_CONFLICT', message: 'Update one framework at a time.' }] };
  const conflicts = diffInstalled(options.rootDir).changed.filter((entry) => requestedKeys.includes(entry.lockKey) && entry.status !== 'registry-update-available' && entry.status !== 'catalog-mismatch');
  if (conflicts.length) return { ok: false, dryRun: Boolean(options.dryRun), updated: [], errors: [{ code: 'UIFN_REGISTRY_DIRTY_CONFLICT', message: 'Update refuses to overwrite modified, missing, or invalid files.', conflicts }] };
  const planned = planInstall({ rootDir: options.rootDir, artifacts: entries.map(([, entry]) => entry.slug), framework: entries[0][1].framework, registry });
  if (!planned.ok) return { ok: false, dryRun: Boolean(options.dryRun), updated: [], errors: [planned.error] };
  const { rootDir: _rootDir, changes, ...publicPlan } = planned.plan;
  if (options.dryRun) return { ok: true, dryRun: true, updated: [], plan: publicPlan, errors: [] };
  const committed = commitTransaction({ rootDir: planned.plan.rootDir, changes }, { faultAfterWrites: options.faultAfterWrites });
  return committed.ok
    ? { ok: true, dryRun: false, updated: planned.plan.resolved, plan: publicPlan, errors: [] }
    : { ok: false, dryRun: false, updated: [], rolledBack: committed.rolledBack, errors: [committed.error!] };
}
