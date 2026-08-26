import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RegistryDependency, RegistryFramework } from './schema';

export interface UifnLockFileEntry {
  name: string;
  slug: string;
  kind: 'component';
  version: string;
  canonicalVersion: string;
  generatorVersion: string;
  framework: RegistryFramework;
  mode: 'source';
  license: 'MIT';
  dependencies: RegistryDependency[];
  files: Array<{
    path: string;
    sourceSha256: string;
    outputSha256: string;
    installedSha256: string;
  }>;
  provenance: {
    source: string;
    sourcePolicy: 'clean-room';
    definitionSha256: string;
    generatorSha256: string;
    templateSha256: string;
  };
}

export interface UifnLockFile {
  schemaVersion: 2;
  registry: 'https://uifn.dev/registry';
  catalogSha256: string;
  signatureKeyId: string;
  items: Record<string, UifnLockFileEntry>;
}

export interface UifnSelectedComponentsFile {
  schemaVersion: 2;
  selected: Record<string, {
    name: string;
    slug: string;
    kind: 'component';
    framework: RegistryFramework;
    mode: 'source';
  }>;
}

export function lockfilePath(rootDir: string): string {
  return path.join(rootDir, '.uifn', 'registry.lock');
}

export function selectedComponentsPath(rootDir: string): string {
  return path.join(rootDir, '.uifn', 'selected-components.json');
}

export function checksumContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function checksumFile(rootDir: string, relativePath: string): string {
  return checksumContent(readFileSync(path.join(rootDir, relativePath)));
}

export function emptyLockFile(catalogSha256: string, signatureKeyId: string): UifnLockFile {
  return { schemaVersion: 2, registry: 'https://uifn.dev/registry', catalogSha256, signatureKeyId, items: {} };
}

export function readLockFile(rootDir: string, fallback?: { catalogSha256: string; signatureKeyId: string }): UifnLockFile {
  const pathname = lockfilePath(rootDir);
  if (!existsSync(pathname)) return emptyLockFile(fallback?.catalogSha256 ?? '', fallback?.signatureKeyId ?? '');
  const parsed = JSON.parse(readFileSync(pathname, 'utf8')) as UifnLockFile;
  if (parsed.schemaVersion !== 2 || parsed.registry !== 'https://uifn.dev/registry' || typeof parsed.items !== 'object') {
    throw Object.assign(new Error('Unsupported or malformed uifn registry lock file.'), { code: 'UIFN_REGISTRY_LOCK_INVALID' });
  }
  return parsed;
}

export function selectedFromLock(lockfile: UifnLockFile): UifnSelectedComponentsFile {
  return {
    schemaVersion: 2,
    selected: Object.fromEntries(Object.entries(lockfile.items).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, {
      name: entry.name,
      slug: entry.slug,
      kind: entry.kind,
      framework: entry.framework,
      mode: entry.mode,
    }])),
  };
}

export function serializeLockFile(lockfile: UifnLockFile): string {
  return `${JSON.stringify({ ...lockfile, items: Object.fromEntries(Object.entries(lockfile.items).sort(([left], [right]) => left.localeCompare(right))) }, null, 2)}\n`;
}

export function serializeSelectedComponents(selected: UifnSelectedComponentsFile): string {
  return `${JSON.stringify(selected, null, 2)}\n`;
}

export function readSelectedComponentsFile(rootDir: string): UifnSelectedComponentsFile {
  const pathname = selectedComponentsPath(rootDir);
  if (!existsSync(pathname)) return { schemaVersion: 2, selected: {} };
  return JSON.parse(readFileSync(pathname, 'utf8')) as UifnSelectedComponentsFile;
}
