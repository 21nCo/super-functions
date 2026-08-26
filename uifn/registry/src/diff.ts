import { existsSync } from 'node:fs';
import { buildRegistry } from './build-registry';
import { checksumFile, readLockFile } from './lockfile';

export type DiffStatus = 'unchanged' | 'locally-modified' | 'registry-update-available' | 'checksum-mismatch' | 'missing-file' | 'catalog-mismatch';

export interface DiffEntry {
  lockKey: string;
  path: string;
  status: DiffStatus;
  installedVersion: string;
  registryVersion?: string;
  threeWay: {
    baseSha256: string;
    localSha256?: string;
    incomingSha256?: string;
  };
}

export interface DiffResult {
  ok: boolean;
  lockPath: '.uifn/registry.lock';
  entries: DiffEntry[];
  changed: DiffEntry[];
  catalogTrusted: boolean;
}

export function diffInstalled(rootDir: string): DiffResult {
  const registry = buildRegistry();
  const lockfile = readLockFile(rootDir, { catalogSha256: registry.trust.catalogSha256, signatureKeyId: registry.trust.keyId });
  const catalogMatches = lockfile.catalogSha256 === registry.trust.catalogSha256 && lockfile.signatureKeyId === registry.trust.keyId;
  const entries = Object.entries(lockfile.items).flatMap(([lockKey, entry]) => {
    const manifest = registry.byLockKey[lockKey];
    const incomingFiles = new Map(manifest?.frameworks?.[entry.framework]?.files.map((file) => [file.destination, file.outputSha256]) ?? []);
    return entry.files.map((file) => {
      const incomingSha256 = incomingFiles.get(file.path);
      let localSha256: string | undefined;
      let status: DiffStatus;
      if (!catalogMatches) status = 'catalog-mismatch';
      else if (file.installedSha256 !== file.outputSha256 || file.sourceSha256 !== file.outputSha256) status = 'checksum-mismatch';
      else if (!existsSync(`${rootDir}/${file.path}`)) status = 'missing-file';
      else {
        localSha256 = checksumFile(rootDir, file.path);
        if (localSha256 !== file.installedSha256) status = 'locally-modified';
        else if (!manifest || incomingSha256 !== file.outputSha256 || manifest.version !== entry.version) status = 'registry-update-available';
        else status = 'unchanged';
      }
      return { lockKey, path: file.path, status, installedVersion: entry.version, registryVersion: manifest?.version, threeWay: { baseSha256: file.installedSha256, localSha256, incomingSha256 } };
    });
  });
  const changed = entries.filter((entry) => entry.status !== 'unchanged');
  return { ok: registry.ok && changed.length === 0, lockPath: '.uifn/registry.lock', entries, changed, catalogTrusted: registry.trust.ok };
}
