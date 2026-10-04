import { execFileSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [command, tag] = process.argv.slice(2);
const number = '(?:0|[1-9][0-9]*)';
const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const match = tag?.match(new RegExp(`^v(${number}\\.${number}\\.${number})(?:-(${identifier}(?:\\.${identifier})*))?$`));
if (!match || !['resolve', 'validate', 'archive'].includes(command)) {
  throw new Error('Expected swift-release.mjs <resolve|validate|archive> v<strict-semver> (root source tag)');
}
const version = tag.slice(1);
const prerelease = Boolean(match[2]);
const products = [
  'AuthFnClient', 'AuthFnSwiftUI', 'AuthFnWebViewBridgeHost',
  'FileFnClient', 'FileFnSwiftUI', 'FileFnWebViewBridgeHost',
  'SearchFnCore', 'SearchFnAdapterContracts', 'SearchFnMemoryAdapter',
  'SearchFnSQLiteAdapter', 'SearchFnClient', 'SearchFnConvenience',
];
const run = (file, args, stdio = 'inherit') => execFileSync(file, args, { cwd: root, stdio, encoding: 'utf8' });
// SwiftPM's version is the root git tag, not an npm/pyproject version. A stable
// root source release may not move consumers backward from an existing tag.
if (!prerelease) {
  const parts = match[1].split('.').map(BigInt);
  const previous = run('git', ['tag', '--list', 'v*'], 'pipe').trim().split('\n');
  for (const existing of previous) {
    if (existing === tag || !/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(existing)) continue;
    const other = existing.slice(1).split('.').map(BigInt);
    let ordering = 0;
    for (let i = 0; i < 3 && ordering === 0; i++) ordering = parts[i] > other[i] ? 1 : parts[i] < other[i] ? -1 : 0;
    if (ordering <= 0) throw new Error(`Stable root tag ${tag} must be newer than ${existing}`);
  }
}
if (command === 'validate') {
  const manifest = JSON.parse(run('swift', ['package', 'dump-package'], 'pipe'));
  const actual = manifest.products.filter(product => product.type.library).map(product => product.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...products].sort())) throw new Error('Root Swift package must expose the 12 supported library products');
  run('swift', ['package', 'resolve']);
  // The root's automatic library products are all built by the default build.
  run('swift', ['build', '--configuration', 'release']);
  run('swift', ['test', '--configuration', 'release']);
}
const outputs = { version, prerelease: String(prerelease), tag };
if (command === 'archive') {
  const directory = path.join(root, 'release-artifacts', tag);
  await mkdir(directory, { recursive: true });
  outputs.source_archive = path.join(directory, `SuperfunctionsSwift-${version}.tar.gz`);
  run('git', ['archive', '--format=tar.gz', `--prefix=SuperfunctionsSwift-${version}/`, '-o', outputs.source_archive, `refs/tags/${tag}`]);
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
console.log(JSON.stringify({ ...outputs, products }, null, 2));
