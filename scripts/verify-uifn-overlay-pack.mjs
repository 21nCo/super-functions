#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'uifn-overlay-pack-'));
const packRoot = path.join(tempRoot, 'packs');
const consumerRoot = path.join(tempRoot, 'consumer');
const sourceCore = path.join(tempRoot, 'source-core.mjs');
const sourceDom = path.join(tempRoot, 'source-dom.mjs');
mkdirSync(packRoot); mkdirSync(consumerRoot);

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const harness = String.raw`
const frameworks=['react','svelte','solid'];
const cases=[
 ['AlertDialog','createAlertDialogController',{}],['Dialog','createDialogController',{}],
 ['Drawer','createDrawerController',{}],['FloatingPanel','createFloatingPanelController',{}],
 ['HoverCard','createHoverCardController',{openDelay:0}],['Popover','createPopoverController',{}],
 ['Tooltip','createTooltipController',{openDelay:0}],['Tour','createTourController',{steps:[{id:'one',title:'One',target:'#one'}]}],
];
export async function exercise(module,label){let count=0;for(const framework of frameworks){for(const [name,factory,inputs] of cases){
 const controller=module[factory](inputs,{generateId:scope=>framework+'-'+label+'-'+scope});
 if(controller.state.policy.primitive!==name)throw new Error(name+' policy identity');
 if(controller.state.policy.portal!==true||controller.state.policy.presence!==true)throw new Error(name+' DOM policy');
 const parts=Object.values(controller.parts); if(parts.length<5)throw new Error(name+' anatomy');
 for(const part of parts){const props=part.getProps();if(!props.id&&!props.role&&!props.data)throw new Error(name+' empty '+part.name);}
 controller.actions.setOpen(true);if(!controller.state.open)throw new Error(name+' did not open');
 controller.destroy();count++;
}}return count;}
`;

try {
  const before = { core: sha256(path.join(repoRoot, 'uifn/core/dist/index.mjs')), dom: sha256(path.join(repoRoot, 'uifn/dom/dist/index.mjs')) };
  run('npm', ['pack','--silent','--workspace','@uifn/core','--pack-destination',packRoot]);
  run('npm', ['pack','--silent','--workspace','@uifn/dom','--pack-destination',packRoot]);
  const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz')).sort();
  const coreTarball = tarballs.find((file) => file.startsWith('uifn-core-'));
  const domTarball = tarballs.find((file) => file.startsWith('uifn-dom-'));
  if (!coreTarball || !domTarball) throw new Error(`Missing tarballs: ${tarballs.join(', ')}`);
  const extractCore = path.join(tempRoot, 'extract-core'); const extractDom = path.join(tempRoot, 'extract-dom');
  mkdirSync(extractCore); mkdirSync(extractDom);
  run('tar',['-xzf',path.join(packRoot,coreTarball),'-C',extractCore]);
  run('tar',['-xzf',path.join(packRoot,domTarball),'-C',extractDom]);
  const packed = { core: sha256(path.join(extractCore,'package/dist/index.mjs')), dom: sha256(path.join(extractDom,'package/dist/index.mjs')) };
  const after = { core: sha256(path.join(repoRoot,'uifn/core/dist/index.mjs')), dom: sha256(path.join(repoRoot,'uifn/dom/dist/index.mjs')) };
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(after) !== JSON.stringify(packed)) throw new Error('Local, prepack, and packed entrypoints are not byte-identical.');
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund',path.join(packRoot,coreTarball),path.join(packRoot,domTarball)],consumerRoot);
  run('npx',['esbuild','uifn/core/src/index.ts','--bundle','--platform=node','--format=esm',`--outfile=${sourceCore}`]);
  run('npx',['esbuild','uifn/dom/src/index.ts','--bundle','--platform=node','--format=esm',`--outfile=${sourceDom}`]);
  const packageCore = await import(pathToFileURL(path.join(consumerRoot,'node_modules/@uifn/core/dist/index.mjs')).href);
  const packageDom = await import(pathToFileURL(path.join(consumerRoot,'node_modules/@uifn/dom/dist/index.mjs')).href);
  const sourceCoreModule = await import(pathToFileURL(sourceCore).href);
  const sourceDomModule = await import(pathToFileURL(sourceDom).href);
  for (const [label,module] of [['package',packageDom],['source',sourceDomModule]]) {
    if (typeof module.createUIFnOverlayDomBinding !== 'function') throw new Error(`${label} DOM binding export missing`);
  }
  const { exercise } = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
  const packageCount = await exercise(packageCore,'package');
  const sourceCount = await exercise(sourceCoreModule,'source');
  const result = {
    ok: packageCount === 24 && sourceCount === 24,
    command: 'verify:uifn-overlay-pack', primitives: 8, frameworks: ['react','svelte','solid'],
    modes: { package: packageCount, source: sourceCount }, byteIdentical: true,
    distSha256: packed,
    tarballs: tarballs.map((file) => ({ file, sha256: sha256(path.join(packRoot,file)) })),
    temporaryRoot: tempRoot,
  };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result,null,2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-overlay-pack', temporaryRoot: tempRoot, error: error instanceof Error ? error.message : String(error) },null,2));
  process.exit(1);
}
