import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(path.join(root, 'uifn/docs/generated/delivery.md'), 'utf8');
const resolver = guide.split('\n').find((line) => line.startsWith('UIFN_CLI='));
const invocation = guide.split('\n').find((line) => line.startsWith('node "$UIFN_CLI" add'));
const packageManifest = JSON.parse(readFileSync(path.join(root, 'uifn/registry/package.json'), 'utf8'));

function withFixture(run) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'uifn-docs-cli-'));
  try {
    run(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function installLayout(directory) {
  const pkg = path.join(directory, 'node_modules/@uifn/registry');
  mkdirSync(path.join(pkg, 'dist'), { recursive: true });
  // Reproduce the actual package's entry/export/bin layout, without running
  // package installation or exercising unrelated registry behavior.
  writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(packageManifest));
  writeFileSync(path.join(pkg, 'dist/index.js'), 'module.exports = {};\n');
  writeFileSync(path.join(pkg, 'dist/bin.mjs'), 'console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n');
}

for (const placement of ['local', 'hoisted']) {
  test(`documented CLI command resolves a ${placement} installation`, () => withFixture((fixture) => {
    const consumer = path.join(fixture, 'packages/app');
    mkdirSync(consumer, { recursive: true });
    installLayout(placement === 'local' ? consumer : fixture);
    assert.ok(resolver && invocation, 'generated guide must contain resolver and invocation');
    const result = spawnSync('/bin/sh', ['-c', `${resolver} && ${invocation}`], { cwd: consumer, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.args, ['add', 'button', '--framework', 'react', '--cwd', '.', '--dry-run', '--json']);
    assert.equal(output.cwd, realpathSync(consumer));
    if (placement === 'hoisted') {
      const old = spawnSync(process.execPath, ['./node_modules/@uifn/registry/dist/bin.mjs', 'add', 'button'], { cwd: consumer, encoding: 'utf8' });
      assert.notEqual(old.status, 0, 'old documented package-relative path must fail in hoisted layout');
      assert.match(old.stderr, /MODULE_NOT_FOUND/);
    }
  }));
}

test('missing installation fails resolution without a download or global CLI', () => withFixture((fixture) => {
  const result = spawnSync('/bin/sh', ['-c', `${resolver} && ${invocation}`], { cwd: fixture, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MODULE_NOT_FOUND/);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(resolver + invocation, /\bnpx\b|\bnpm exec\b/);
}));
