import type { BuiltRegistry } from './build-registry';
import { planInstall, type RegistryInstallPlan } from './plan';
import { commitTransaction } from './transaction';

export interface AddOptions {
  rootDir: string;
  artifact: string;
  framework: string;
  dryRun?: boolean;
  faultAfterWrites?: number;
  registry?: BuiltRegistry;
  registryRoot?: string;
}

export interface AddResult {
  ok: boolean;
  dryRun: boolean;
  written: string[];
  unchanged: string[];
  lockUpdated: boolean;
  lockKey?: string;
  plan?: Omit<RegistryInstallPlan, 'rootDir' | 'changes'>;
  rolledBack?: boolean;
  error?: { code: string; message: string; path?: string; conflicts?: unknown[] };
}

export function addArtifact(options: AddOptions): AddResult {
  const planned = planInstall({ rootDir: options.rootDir, artifacts: [options.artifact], framework: options.framework, registry: options.registry });
  if (!planned.ok) return { ok: false, dryRun: Boolean(options.dryRun), written: [], unchanged: [], lockUpdated: false, error: planned.error };
  const { rootDir: _rootDir, changes, ...publicPlan } = planned.plan;
  if (options.dryRun) return { ok: true, dryRun: true, written: [], unchanged: planned.plan.files.filter((file) => file.operation === 'unchanged').map((file) => file.path), lockUpdated: false, lockKey: planned.plan.lockKeys[0], plan: publicPlan };
  const committed = commitTransaction({ rootDir: planned.plan.rootDir, changes }, { faultAfterWrites: options.faultAfterWrites });
  if (!committed.ok) return { ok: false, dryRun: false, written: [], unchanged: [], lockUpdated: false, rolledBack: committed.rolledBack, error: committed.error };
  return { ok: true, dryRun: false, written: committed.committed.filter((file) => !file.startsWith('.uifn/')), unchanged: planned.plan.files.filter((file) => file.operation === 'unchanged').map((file) => file.path), lockUpdated: planned.plan.files.some((file) => file.path === '.uifn/registry.lock' && file.operation !== 'unchanged'), lockKey: planned.plan.lockKeys[0], plan: publicPlan };
}
