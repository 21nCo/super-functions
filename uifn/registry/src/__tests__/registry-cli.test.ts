import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addArtifact } from '../add';
import { buildRegistry } from '../build-registry';
import { runCli } from '../cli';
import { diffInstalled } from '../diff';
import { readLockFile } from '../lockfile';
import { planInstall } from '../plan';
import { removeInstalled } from '../remove';
import { updateInstalled } from '../update';

function snapshot(rootDir: string): string {
  const entries: string[] = [];
  const walk = (relative = '') => {
    for (const name of readdirSync(path.join(rootDir, relative)).sort()) {
      const child = path.join(relative, name);
      const stat = lstatSync(path.join(rootDir, child));
      if (stat.isDirectory()) walk(child);
      else if (stat.isSymbolicLink()) entries.push(`${child}\0symlink:${readlinkSync(path.join(rootDir, child))}`);
      else entries.push(`${child}\0${createHash('sha256').update(readFileSync(path.join(rootDir, child))).digest('hex')}`);
    }
  };
  walk();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

function withProject(callback: (rootDir: string) => void) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'uifn-phase16-registry-'));
  try { callback(rootDir); } finally { rmSync(rootDir, { recursive: true, force: true }); }
}

async function withProjectAsync(callback: (rootDir: string) => Promise<void>) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'uifn-phase16-registry-'));
  try { await callback(rootDir); } finally { rmSync(rootDir, { recursive: true, force: true }); }
}

describe('TV-REG-001-P/N transaction-safe registry', () => {
  it('dry-run returns the exact plan and makes no writes', () => {
    withProject((rootDir) => {
      writeFileSync(path.join(rootDir, 'package.json'), '{"name":"consumer","private":true}\n');
      const before = snapshot(rootDir);
      const result = addArtifact({ rootDir, artifact: 'button', framework: 'react', dryRun: true });
      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.plan?.resolved).toEqual(['button']);
      expect(result.plan?.dependencies.map((dependency) => dependency.name)).toEqual(['@uifn/components', '@uifn/react', 'react', 'react-dom']);
      expect(result.plan?.files.map((file) => file.path)).toEqual(expect.arrayContaining(['components/uifn/react/button.ts', 'package.json', '.uifn/registry.lock', '.uifn/selected-components.json']));
      expect(snapshot(rootDir)).toBe(before);
    });
  });

  it('commits atomically, records provenance, and is byte-idempotent', () => {
    withProject((rootDir) => {
      const first = addArtifact({ rootDir, artifact: 'button', framework: 'react' });
      expect(first.ok).toBe(true);
      const lock = readLockFile(rootDir);
      expect(lock.schemaVersion).toBe(2);
      expect(lock.catalogSha256).toHaveLength(64);
      expect(lock.signatureKeyId).toHaveLength(24);
      expect(lock.items['component:button']).toMatchObject({ license: 'MIT', framework: 'react', mode: 'source' });
      expect(lock.items['component:button'].provenance).toMatchObject({ sourcePolicy: 'clean-room' });
      const afterFirst = snapshot(rootDir);
      const second = addArtifact({ rootDir, artifact: 'button', framework: 'react' });
      expect(second.ok).toBe(true);
      expect(second.written).toEqual([]);
      expect(snapshot(rootDir)).toBe(afterFirst);
      expect(diffInstalled(rootDir)).toMatchObject({ ok: true, changed: [] });
    });
  });

  it('rejects dirty conflicts with three-way hashes and preserves bytes', () => {
    withProject((rootDir) => {
      expect(addArtifact({ rootDir, artifact: 'button', framework: 'react' }).ok).toBe(true);
      const target = path.join(rootDir, 'components/uifn/react/button.ts');
      writeFileSync(target, 'local edit\n');
      const before = snapshot(rootDir);
      const result = addArtifact({ rootDir, artifact: 'button', framework: 'react' });
      expect(result).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_DIRTY_CONFLICT' } });
      expect(result.error?.conflicts?.[0]).toMatchObject({ baseSha256: expect.any(String), localSha256: expect.any(String), incomingSha256: expect.any(String) });
      expect(snapshot(rootDir)).toBe(before);
      expect(updateInstalled({ rootDir })).toMatchObject({ ok: false, errors: [{ code: 'UIFN_REGISTRY_DIRTY_CONFLICT' }] });
    });
  });

  it('rejects symlink escape before writes and leaves the outside byte-identical', () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'uifn-phase16-outside-'));
    try {
      withProject((rootDir) => {
        const parent = path.join(rootDir, 'components/uifn');
        mkdirSync(parent, { recursive: true });
        symlinkSync(outside, path.join(parent, 'react'));
        const beforeProject = snapshot(rootDir);
        const beforeOutside = snapshot(outside);
        const result = addArtifact({ rootDir, artifact: 'button', framework: 'react' });
        expect(result).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_SYMLINK_ESCAPE' } });
        expect(snapshot(rootDir)).toBe(beforeProject);
        expect(snapshot(outside)).toBe(beforeOutside);
      });
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  it('kills bad checksum, traversal, cycle, and unsupported framework catalogs', () => {
    const base = buildRegistry();
    const checksumArtifacts = structuredClone(base.artifacts);
    checksumArtifacts[0].frameworks.react.files[0].contents += 'tamper';
    expect(buildRegistry(undefined, { catalogOverride: checksumArtifacts }).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_CHECKSUM_MISMATCH');
    const traversalArtifacts = structuredClone(base.artifacts);
    traversalArtifacts[0].frameworks.react.files[0].destination = '../outside.ts';
    expect(buildRegistry(undefined, { catalogOverride: traversalArtifacts }).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_PATH_ESCAPE');
    const cycleArtifacts = structuredClone(base.artifacts);
    cycleArtifacts[0].artifactDependencies = [cycleArtifacts[1].slug];
    cycleArtifacts[1].artifactDependencies = [cycleArtifacts[0].slug];
    expect(buildRegistry(undefined, { catalogOverride: cycleArtifacts }).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_DEPENDENCY_CYCLE');
    withProject((rootDir) => expect(planInstall({ rootDir, artifacts: ['button'], framework: 'vue' })).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_UNSUPPORTED_FRAMEWORK' } }));
  });

  it('rolls back an injected mid-commit interruption byte-for-byte', () => {
    withProject((rootDir) => {
      writeFileSync(path.join(rootDir, 'package.json'), '{"name":"consumer","private":true}\n');
      const before = snapshot(rootDir);
      const result = addArtifact({ rootDir, artifact: 'select', framework: 'solid', faultAfterWrites: 2 });
      expect(result).toMatchObject({ ok: false, rolledBack: true, error: { code: 'UIFN_REGISTRY_TRANSACTION_INTERRUPTED' } });
      expect(snapshot(rootDir)).toBe(before);
      expect(existsSync(path.join(rootDir, '.uifn'))).toBe(false);
    });
  });

  it('removes only unchanged installed files and preserves dirty files', () => {
    withProject((rootDir) => {
      expect(addArtifact({ rootDir, artifact: 'button', framework: 'svelte' }).ok).toBe(true);
      const dry = removeInstalled({ rootDir, lockKeys: ['button'], dryRun: true });
      expect(dry.ok).toBe(true);
      expect(readLockFile(rootDir).items['component:button']).toBeTruthy();
      const removed = removeInstalled({ rootDir, lockKeys: ['button'] });
      expect(removed.ok).toBe(true);
      expect(readLockFile(rootDir).items['component:button']).toBeUndefined();
    });
    withProject((rootDir) => {
      expect(addArtifact({ rootDir, artifact: 'button', framework: 'react' }).ok).toBe(true);
      writeFileSync(path.join(rootDir, 'components/uifn/react/button.ts'), 'local edit\n');
      expect(removeInstalled({ rootDir, lockKeys: ['button'] })).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_DIRTY_CONFLICT' } });
    });
  });

  it('exposes list/info/validate/doctor/add/remove through the CLI', async () => {
    await withProjectAsync(async (rootDir) => {
      expect((await runCli(['validate', '--json'], { cwd: rootDir })).exitCode).toBe(0);
      expect((await runCli(['list', '--json'], { cwd: rootDir })).exitCode).toBe(0);
      expect((await runCli(['info', 'button', '--framework', 'react', '--json'], { cwd: rootDir })).exitCode).toBe(0);
      expect((await runCli(['add', 'button', '--framework', 'react', '--json'], { cwd: rootDir })).exitCode).toBe(0);
      expect((await runCli(['doctor', '--json'], { cwd: rootDir })).exitCode).toBe(0);
      expect((await runCli(['remove', 'button', '--json'], { cwd: rootDir })).exitCode).toBe(0);
    });
  });
});
