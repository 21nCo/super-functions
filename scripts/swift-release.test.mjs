import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts/swift-release.mjs');
const run = tag => spawnSync(process.execPath, [script, 'resolve', tag], { cwd: root, encoding: 'utf8' });

test('root Swift stable and prerelease tags preserve release semantics', () => {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n');
  const majors = tags.filter(tag => /^v\d+\.\d+\.\d+$/.test(tag)).map(tag => BigInt(tag.slice(1).split('.')[0]));
  const major = majors.reduce((max, value) => value > max ? value : max, 0n) + 1n;
  const stable = run(`v${major}.0.0`);
  assert.equal(stable.status, 0, stable.stderr);
  const resolved = JSON.parse(stable.stdout);
  assert.equal(resolved.prerelease, 'false');
  const experimental = run(`v${major}.1.0-experimental.0`);
  assert.equal(experimental.status, 0, experimental.stderr);
  assert.equal(JSON.parse(experimental.stdout).prerelease, 'true');
});

test('npm, Python, noncanonical and unsafe root tags fail', () => {
  for (const tag of ['authfn-core-v1.0.0', 'python-authfn-v1.0.0', 'v01.0.0', 'v1.0.0-rc.01', 'v1.0.0-rc..1', 'v1.0.0+build.1', 'refs/heads/main', 'v1.0']) {
    assert.notEqual(run(tag).status, 0, tag);
  }
});
