import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildRegistry } from './build-registry';
import { checksumFile, readLockFile, selectedFromLock, serializeLockFile, serializeSelectedComponents } from './lockfile';
import { commitTransaction, type TransactionChange } from './transaction';

export interface RemoveOptions { rootDir: string; lockKeys: string[]; dryRun?: boolean; faultAfterWrites?: number }

export function removeInstalled(options: RemoveOptions) {
  const registry = buildRegistry();
  const lockfile = readLockFile(options.rootDir, { catalogSha256: registry.trust.catalogSha256, signatureKeyId: registry.trust.keyId });
  const requested = options.lockKeys.map((value) => value.includes(':') ? value : `component:${value}`);
  const entries = requested.map((key) => [key, lockfile.items[key]] as const);
  const missing = entries.filter(([, entry]) => !entry).map(([key]) => key);
  if (missing.length) return { ok: false, dryRun: Boolean(options.dryRun), removed: [], error: { code: 'UIFN_REGISTRY_ARTIFACT_NOT_INSTALLED', message: `Not installed: ${missing.join(', ')}` } };
  const changes: TransactionChange[] = [];
  for (const [, entry] of entries) {
    for (const file of entry!.files) {
      const absolute = path.join(options.rootDir, file.path);
      if (!existsSync(absolute) || checksumFile(options.rootDir, file.path) !== file.installedSha256) return { ok: false, dryRun: Boolean(options.dryRun), removed: [], error: { code: 'UIFN_REGISTRY_DIRTY_CONFLICT', message: `Refusing to remove modified or missing file: ${file.path}` } };
      changes.push({ path: file.path, operation: 'delete', expectedSha256: file.installedSha256 });
    }
  }
  const nextLock = structuredClone(lockfile);
  requested.forEach((key) => { delete nextLock.items[key]; });
  for (const [relative, contents] of [
    ['.uifn/registry.lock', serializeLockFile(nextLock)],
    ['.uifn/selected-components.json', serializeSelectedComponents(selectedFromLock(nextLock))],
  ] as const) {
    const absolute = path.join(options.rootDir, relative);
    const previous = existsSync(absolute) ? checksumFile(options.rootDir, relative) : undefined;
    changes.push({ path: relative, operation: previous ? 'update' : 'create', expectedSha256: previous, contents });
  }
  if (options.dryRun) return { ok: true, dryRun: true, removed: [], plan: changes.map(({ contents: _contents, ...change }) => change) };
  const committed = commitTransaction({ rootDir: options.rootDir, changes }, { faultAfterWrites: options.faultAfterWrites });
  return committed.ok ? { ok: true, dryRun: false, removed: requested } : { ok: false, dryRun: false, removed: [], rolledBack: committed.rolledBack, error: committed.error };
}
