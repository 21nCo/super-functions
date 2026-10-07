import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveReleaseTag } from './resolve-release-tag.mjs';

const target = await resolveReleaseTag(process.argv[2] ?? process.env.RELEASE_TAG);
const root = path.resolve(import.meta.dirname, '..');
const cwd = path.join(root, target.path);
const manifestFile = path.join(cwd, 'package.json');
const manifestSource = await readFile(manifestFile, 'utf8');
const manifest = JSON.parse(manifestSource);
const npm = (...args) => execFileSync('npm', args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
for (const script of ['build', 'test']) {
  if (!manifest.scripts?.[script]) throw new Error(`${target.name} is missing required release script "${script}"`);
}
// Generated release inputs must already be committed at the immutable tag.
// In particular, generating registry catalogs here would invalidate their signature.
const typecheck = manifest.scripts?.typecheck ? 'typecheck' : 'type-check';
for (const script of ['generate:check', 'build', typecheck, 'test']) {
  if (manifest.scripts?.[script]) npm('run', script);
}
// Run pack lifecycle hooks once; publishing this exact tarball cannot rebuild
// a different artifact in prepublishOnly/prepare/prepack.
const destination = await mkdtemp(path.join(tmpdir(), 'npm-release-'));
// Tarball publication reads its embedded manifest outside the Git checkout.
// Preserve commit lineage in that artifact without leaving source mutations.
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let packed;
try {
  await writeFile(manifestFile, `${JSON.stringify({ ...manifest, gitHead }, null, 2)}\n`);
  packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--foreground-scripts=false', '--pack-destination', destination], { cwd, encoding: 'utf8' }));
} finally {
  await writeFile(manifestFile, manifestSource);
}
if (packed.length !== 1 || packed[0].name !== target.name || packed[0].version !== target.version) {
  throw new Error('Packed artifact identity does not match resolved release target');
}
const tarball = path.join(destination, packed[0].filename);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
console.log(JSON.stringify({ ...target, gitHead, tarball, integrity: packed[0].integrity }, null, 2));
