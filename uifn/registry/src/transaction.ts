import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { checksumContent } from './lockfile';
import { isSafeRegistryPath } from './schema';

export interface TransactionChange {
  path: string;
  operation: 'create' | 'update' | 'delete';
  contents?: string;
  expectedSha256?: string;
}

export interface TransactionPlan {
  rootDir: string;
  changes: TransactionChange[];
}

export interface TransactionOptions {
  faultAfterWrites?: number;
}

export interface TransactionResult {
  ok: boolean;
  committed: string[];
  rolledBack: boolean;
  error?: { code: string; message: string };
}

function error(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export function assertContainedPath(rootDir: string, relativePath: string): string {
  if (!isSafeRegistryPath(relativePath) && relativePath !== '.uifn/registry.lock' && relativePath !== '.uifn/selected-components.json' && relativePath !== 'package.json') {
    throw error('UIFN_REGISTRY_PATH_ESCAPE', `Unsafe registry path: ${relativePath}`);
  }
  const root = path.resolve(rootDir);
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw error('UIFN_REGISTRY_SYMLINK_ESCAPE', 'Consumer project root must not be a symlink.');
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw error('UIFN_REGISTRY_PATH_ESCAPE', `Registry path escapes project root: ${relativePath}`);
  let cursor = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean).slice(0, -1)) {
    cursor = path.join(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw error('UIFN_REGISTRY_SYMLINK_ESCAPE', `Registry path crosses a symlink: ${relativePath}`);
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw error('UIFN_REGISTRY_SYMLINK_ESCAPE', `Registry target is a symlink: ${relativePath}`);
  return target;
}

function removeEmptyParents(rootDir: string, pathname: string): void {
  const root = path.resolve(rootDir);
  let cursor = path.dirname(pathname);
  while (cursor.startsWith(`${root}${path.sep}`) && cursor !== root) {
    try {
      if (readdirSync(cursor).length > 0) break;
      rmdirSync(cursor);
      cursor = path.dirname(cursor);
    } catch { break; }
  }
}

export function commitTransaction(plan: TransactionPlan, options: TransactionOptions = {}): TransactionResult {
  const rootDir = path.resolve(plan.rootDir);
  const seen = new Set<string>();
  for (const change of plan.changes) {
    assertContainedPath(rootDir, change.path);
    const folded = change.path.toLocaleLowerCase('en-US');
    if (seen.has(folded)) return { ok: false, committed: [], rolledBack: false, error: { code: 'UIFN_REGISTRY_CASE_COLLISION', message: `Case-colliding transaction path: ${change.path}` } };
    seen.add(folded);
    if (change.operation !== 'delete' && typeof change.contents !== 'string') return { ok: false, committed: [], rolledBack: false, error: { code: 'UIFN_REGISTRY_PLAN_INVALID', message: `Missing contents for ${change.path}` } };
  }

  const stageRoot = mkdtempSync(path.join(rootDir, '.uifn-stage-'));
  const snapshots = new Map<string, Buffer | null>();
  const committed: string[] = [];
  try {
    for (const change of plan.changes) {
      const target = assertContainedPath(rootDir, change.path);
      const exists = existsSync(target);
      if (change.operation === 'create' && exists) throw error('UIFN_REGISTRY_PRECONDITION_FAILED', `Expected ${change.path} to remain absent.`);
      if ((change.operation === 'update' || change.operation === 'delete') && (!exists || checksumContent(readFileSync(target)) !== change.expectedSha256)) {
        throw error('UIFN_REGISTRY_PRECONDITION_FAILED', `Precondition changed before commit: ${change.path}`);
      }
      snapshots.set(change.path, existsSync(target) ? readFileSync(target) : null);
      if (change.operation !== 'delete') {
        const staged = path.join(stageRoot, change.path);
        mkdirSync(path.dirname(staged), { recursive: true });
        writeFileSync(staged, change.contents!);
      }
    }

    let count = 0;
    for (const change of plan.changes) {
      const target = assertContainedPath(rootDir, change.path);
      mkdirSync(path.dirname(target), { recursive: true });
      if (change.operation === 'delete') {
        if (existsSync(target)) unlinkSync(target);
      } else {
        renameSync(path.join(stageRoot, change.path), target);
      }
      committed.push(change.path);
      count += 1;
      if (options.faultAfterWrites === count) throw error('UIFN_REGISTRY_TRANSACTION_INTERRUPTED', `Injected interruption after ${count} committed writes.`);
    }
    rmSync(stageRoot, { recursive: true, force: true });
    return { ok: true, committed, rolledBack: false };
  } catch (cause) {
    for (const relativePath of [...committed].reverse()) {
      const target = path.join(rootDir, relativePath);
      const snapshot = snapshots.get(relativePath);
      if (snapshot === null) {
        if (existsSync(target)) unlinkSync(target);
        removeEmptyParents(rootDir, target);
      } else if (snapshot) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, snapshot);
      }
    }
    rmSync(stageRoot, { recursive: true, force: true });
    const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : 'UIFN_REGISTRY_TRANSACTION_FAILED';
    return { ok: false, committed: [], rolledBack: true, error: { code, message: cause instanceof Error ? cause.message : String(cause) } };
  }
}
