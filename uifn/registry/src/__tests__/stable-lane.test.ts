import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addArtifact } from '../add';
import { buildRegistry } from '../build-registry';
import { readLockFile } from '../lockfile';
import { REQUIRED_FRAMEWORKS } from '../schema';

function withProject(callback: (rootDir: string) => void) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'uifn-phase16-lane-'));
  try { callback(rootDir); } finally { rmSync(rootDir, { recursive: true, force: true }); }
}

describe('stable source delivery lane', () => {
  const adapterVersions = Object.fromEntries(
    REQUIRED_FRAMEWORKS.map((framework) => [
      framework,
      JSON.parse(readFileSync(new URL(`../../../${framework}/package.json`, import.meta.url), 'utf8')).version,
    ]),
  ) as Record<(typeof REQUIRED_FRAMEWORKS)[number], string>;

  it('contains only the current canonical components', () => {
    const registry = buildRegistry();
    expect(registry.ok).toBe(true);
    expect(registry.artifacts).toHaveLength(69);
    expect(new Set(registry.artifacts.map((artifact) => artifact.kind))).toEqual(new Set(['component']));
  });

  it.each(REQUIRED_FRAMEWORKS)('source-installs exact generated %s modules and provenance', (framework) => {
    withProject((rootDir) => {
      const result = addArtifact({ rootDir, artifact: 'button', framework });
      expect(result.ok).toBe(true);
      const lock = readLockFile(rootDir);
      const entry = lock.items['component:button'];
      expect(entry.framework).toBe(framework);
      expect(entry.provenance.sourcePolicy).toBe('clean-room');
      expect(entry.provenance.definitionSha256).toHaveLength(64);
      expect(entry.files.every((file) => existsSync(path.join(rootDir, file.path)) && file.installedSha256 === file.outputSha256)).toBe(true);
      const manifest = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      expect(manifest.dependencies).toMatchObject({
        '@uifn/recipes': '0.0.1',
        [`@uifn/${framework}`]: adapterVersions[framework],
      });
    });
  });

  it.each(['vue', 'angular'])('rejects removed framework %s before any write', (framework) => {
    withProject((rootDir) => {
      const result = addArtifact({ rootDir, artifact: 'button', framework });
      expect(result).toMatchObject({ ok: false, written: [], error: { code: 'UIFN_REGISTRY_UNSUPPORTED_FRAMEWORK' } });
      expect(existsSync(path.join(rootDir, 'package.json'))).toBe(false);
      expect(existsSync(path.join(rootDir, '.uifn'))).toBe(false);
    });
  });
});
