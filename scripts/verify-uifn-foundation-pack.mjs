#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'uifn-foundation-pack-'));
const packRoot = path.join(tempRoot, 'packs');
const consumerRoot = path.join(tempRoot, 'consumer');
const sourceBundle = path.join(tempRoot, 'source-core.mjs');
mkdirSync(packRoot); mkdirSync(consumerRoot);

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const harness = String.raw`
const frameworks=['react','svelte','solid'];
const staticCases=[
  ['AvatarContract',{alt:'Avatar'}],['ButtonContract',{}],['FieldContract',{name:'email'}],
  ['FieldsetContract',{}],['FormContract',{}],['InputContract',{name:'email'}],
  ['MarqueeContract',{reducedMotion:true}],['QRCodeContract',{value:'https://21n.org',label:'Open 21n'}],['SeparatorContract',{}],
];
const controllerCases=[
  ['createAccordionController',{items:['one','two']},c=>c.parts.trigger.getProps('one')],
  ['createCollapsibleController',{},c=>c.parts.trigger.getProps()],
  ['createImageCropperController',{src:'/image.png'},c=>c.parts.zoomControl.getProps()],
  ['createScrollAreaController',{},c=>c.parts.viewport.getProps()],
  ['createToolbarController',{items:[{id:'one'},{id:'two'}]},c=>c.parts.root.getProps()],
];
export async function exercise(module,label){let count=0; for(const framework of frameworks){
  for(const [name,inputs] of staticCases){const contract=module[name]; if(!contract||'subscribe' in contract)throw new Error(framework+' '+name+' static runtime'); const parts=contract.getParts(inputs,{scopeId:framework+'-'+label+'-'+name}); if(!parts||Object.keys(parts).length===0)throw new Error('empty '+name); count++;}
  for(const [name,inputs,getPart] of controllerCases){const controller=module[name](inputs,{generateId:scope=>framework+'-'+label+'-'+scope}); const part=getPart(controller); if(!part||(!part.id&&!part.role&&!part.data))throw new Error('empty '+name); controller.destroy(); count++;}
} return count;}
`;

try {
  const localBeforePack = sha256(path.join(repoRoot, 'uifn/core/dist/index.mjs'));
  run('npm', ['pack', '--silent', '--workspace', '@uifn/core', '--pack-destination', packRoot]);
  const tarball = readdirSync(packRoot).find((file) => file.startsWith('uifn-core-') && file.endsWith('.tgz'));
  if (!tarball) throw new Error('Core tarball missing.');
  const localAfterPack = sha256(path.join(repoRoot, 'uifn/core/dist/index.mjs'));
  const extractRoot = path.join(tempRoot, 'extract'); mkdirSync(extractRoot);
  run('tar', ['-xzf', path.join(packRoot, tarball), '-C', extractRoot]);
  const packedDist = sha256(path.join(extractRoot, 'package/dist/index.mjs'));
  if (localBeforePack !== localAfterPack || localAfterPack !== packedDist) throw new Error('Local, prepack, and packed core entrypoints are not byte-identical.');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(packRoot, tarball)], consumerRoot);
  run('npx', ['esbuild', 'uifn/core/src/index.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${sourceBundle}`]);
  const packageModule = await import(pathToFileURL(path.join(consumerRoot, 'node_modules/@uifn/core/dist/index.mjs')).href);
  const sourceModule = await import(pathToFileURL(sourceBundle).href);
  const harnessUrl = `data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`;
  const { exercise } = await import(harnessUrl);
  const packageCount = await exercise(packageModule, 'package');
  const sourceCount = await exercise(sourceModule, 'source');
  const result = { ok: packageCount === 42 && sourceCount === 42, command: 'verify:uifn-foundation-pack', modes: { package: packageCount, source: sourceCount }, frameworks: ['react', 'svelte', 'solid'], primitives: 14, distSha256: packedDist, byteIdentical: true, temporaryRoot: tempRoot };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-foundation-pack', temporaryRoot: tempRoot, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
