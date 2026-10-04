import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveReleaseTag } from './resolve-release-tag.mjs';


test('strict semver, target identity, private guard and channel safety', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'release-tag-contract-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, 'library'));
  await writeFile(path.join(fixture, 'release-packages.json'), JSON.stringify([{ slug: 'library', name: '@fixture/library', path: 'library' }]));
  const setManifest = version => writeFile(path.join(fixture, 'library/package.json'), JSON.stringify({ name: '@fixture/library', version }));
  const resolve = tag => resolveReleaseTag(tag, { root: fixture });
  for (const [version, channel] of [['1.2.3', 'latest'], ['1.2.3-experimental.0', 'experimental'], ['1.2.3-rc.1', 'rc'], ['1.2.3-beta.2+build.3', 'beta']]) {
    await setManifest(version);
    assert.equal((await resolve(`library-v${version}`)).distTag, channel);
  }
  for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-rc..1', '1.2.3-rc.01', '1.2.3+', '1.2.3-0', '1.2.3-x.1', '1.2.3-v1.0', '1.2.3-latest.1', '1.2.3-Experimental.1']) {
    await setManifest(version);
    await assert.rejects(resolve(`library-v${version}`));
  }
  await setManifest('1.2.3');
  await assert.rejects(resolve('library-v1.2.4'), /does not match/);
  await assert.rejects(resolve('unsupported-v1.2.3'), /No publishable/);
  await assert.rejects(resolve('python-library-v1.2.3'), /No publishable/);
  await assert.rejects(resolve('v1.2.3'), /Unsupported tag/);
  await writeFile(path.join(fixture, 'library/package.json'), JSON.stringify({ name: '@fixture/library', version: '1.2.3', private: true }));
  await assert.rejects(resolve('library-v1.2.3'), /private package/);
  await writeFile(path.join(fixture, 'library/package.json'), JSON.stringify({ name: '@fixture/wrong', version: '1.2.3' }));
  await assert.rejects(resolve('library-v1.2.3'), /expected/);
  await writeFile(path.join(fixture, 'library/package.json'), JSON.stringify({ name: '@fixture/library', version: '1.2.3-rc.1', publishConfig: { tag: 'latest' } }));
  await assert.rejects(resolve('library-v1.2.3-rc.1'), /conflicts/);
});
