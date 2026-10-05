import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const guard = path.join(import.meta.dirname, 'assert-release-ref.mjs');

test('immutable guard distinguishes tag commits, unrelated dispatch refs and moved remote tags', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'immutable-release-contract-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const remote = path.join(temp, 'origin.git');
  const checkout = path.join(temp, 'checkout');
  await mkdir(checkout);
  const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote);
  git('init');
  git('config', 'user.name', 'Release contract');
  git('config', 'user.email', 'release-contract@example.invalid');
  git('remote', 'add', 'origin', remote);
  await writeFile(path.join(checkout, 'library.txt'), 'release source\n');
  git('add', 'library.txt');
  git('commit', '-m', 'Release source');
  const source = git('rev-parse', 'HEAD');
  git('tag', 'library-v1.0.0');
  git('tag', '-a', 'library-v1.0.1', '-m', 'Annotated release');
  git('push', 'origin', 'refs/tags/library-v1.0.0', 'refs/tags/library-v1.0.1');
  const run = (tag, expected) => spawnSync(process.execPath, [guard, tag, ...(expected ? [expected] : [])], { cwd: checkout, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
  for (const tag of ['library-v1.0.0', 'library-v1.0.1']) {
    const result = run(tag, source);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), source);
  }
  await writeFile(path.join(checkout, 'library.txt'), 'unrelated dispatch source\n');
  git('add', 'library.txt');
  git('commit', '-m', 'Unrelated branch source');
  const unrelated = git('rev-parse', 'HEAD');
  assert.notEqual(run('library-v1.0.0').status, 0);
  git('checkout', '--detach', source);
  assert.notEqual(run('library-v1.0.0', unrelated).status, 0);
  assert.notEqual(run('refs/heads/main').status, 0);
  // Move only the disposable bare remote's tag to test the post-build guard.
  execFileSync('git', ['--git-dir', remote, 'fetch', checkout, unrelated], { stdio: 'pipe' });
  execFileSync('git', ['--git-dir', remote, 'update-ref', 'refs/tags/library-v1.0.0', unrelated], { stdio: 'pipe' });
  const moved = run('library-v1.0.0', source);
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, /no longer identifies/);
});
