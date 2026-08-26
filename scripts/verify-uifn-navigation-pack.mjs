#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'uifn-navigation-pack-'));
const packRoot = path.join(tempRoot, 'packs'); const consumerRoot = path.join(tempRoot, 'consumer');
const sourceCore = path.join(tempRoot, 'source-core.mjs'); const sourceDom = path.join(tempRoot, 'source-dom.mjs');
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
 ['ContextMenu','createContextMenuController',{items:[{id:'a'}]}],
 ['Menu','createMenuController',{defaultOpen:true,items:[{id:'a'},{id:'b',disabled:true},{id:'c'}]}],
 ['Menubar','createMenubarController',{dir:'rtl',items:[{id:'file'},{id:'new',parentId:'file'}]}],
 ['NavigationMenu','createNavigationMenuController',{items:[{id:'docs',hasContent:true}]}],
 ['Pagination','createPaginationController',{count:100}],
 ['Tabs','createTabsController',{items:['a','b'],defaultValue:'a'}],
 ['TreeView','createTreeViewController',{items:[{id:'a',children:[{id:'child'}]}]}],
];
const expected={ContextMenu:11,Menu:11,Menubar:7,NavigationMenu:8,Pagination:7,Tabs:5,TreeView:8};
export async function exercise(module,label){let count=0;for(const framework of frameworks){for(const [name,factory,inputs] of cases){
 const controller=module[factory](inputs,{generateId:scope=>framework+'-'+label+'-'+name+'-'+scope});
 if(Object.keys(controller.parts).length!==expected[name])throw new Error(name+' anatomy');
 if(name==='ContextMenu'){controller.actions.openAt(4,5);if(!controller.state.open)throw new Error(name+' open');}
 if(name==='Menu'){controller.actions.handleKeyDown('ArrowDown','a');if(controller.state.activeItem!=='c')throw new Error(name+' disabled navigation');}
 if(name==='Menubar'){controller.actions.handleTriggerKeyDown('ArrowDown','file');if(controller.state.activeItem!=='new')throw new Error(name+' rtl down');}
 if(name==='NavigationMenu'){controller.actions.setValue('docs');if(controller.state.value!=='docs')throw new Error(name+' value');}
 if(name==='Pagination'){controller.actions.next();if(controller.state.page!==2)throw new Error(name+' next');}
 if(name==='Tabs'){controller.actions.handleKeyDown('ArrowRight','a');if(controller.state.value!=='b')throw new Error(name+' key');}
 if(name==='TreeView'){controller.actions.expand('a');if(!controller.state.expanded.includes('a'))throw new Error(name+' expand');}
 controller.destroy();count++;
}}return count;}
`;
try {
  const before = { core: sha256(path.join(repoRoot,'uifn/core/dist/index.mjs')), dom: sha256(path.join(repoRoot,'uifn/dom/dist/index.mjs')) };
  run('npm',['pack','--silent','--workspace','@uifn/core','--pack-destination',packRoot]);
  run('npm',['pack','--silent','--workspace','@uifn/dom','--pack-destination',packRoot]);
  const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz')).sort();
  const coreTarball = tarballs.find((file) => file.startsWith('uifn-core-')); const domTarball = tarballs.find((file) => file.startsWith('uifn-dom-'));
  if (!coreTarball || !domTarball) throw new Error(`Missing tarballs: ${tarballs.join(', ')}`);
  const extractCore = path.join(tempRoot,'extract-core'); const extractDom = path.join(tempRoot,'extract-dom'); mkdirSync(extractCore); mkdirSync(extractDom);
  run('tar',['-xzf',path.join(packRoot,coreTarball),'-C',extractCore]); run('tar',['-xzf',path.join(packRoot,domTarball),'-C',extractDom]);
  const packed = { core: sha256(path.join(extractCore,'package/dist/index.mjs')), dom: sha256(path.join(extractDom,'package/dist/index.mjs')) };
  const after = { core: sha256(path.join(repoRoot,'uifn/core/dist/index.mjs')), dom: sha256(path.join(repoRoot,'uifn/dom/dist/index.mjs')) };
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(after) !== JSON.stringify(packed)) throw new Error('Local, prepack, and packed entrypoints are not byte-identical.');
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund',path.join(packRoot,coreTarball),path.join(packRoot,domTarball)],consumerRoot);
  run('npx',['esbuild','uifn/core/src/index.ts','--bundle','--platform=node','--format=esm',`--outfile=${sourceCore}`]);
  run('npx',['esbuild','uifn/dom/src/index.ts','--bundle','--platform=node','--format=esm',`--outfile=${sourceDom}`]);
  const packageCore = await import(pathToFileURL(path.join(consumerRoot,'node_modules/@uifn/core/dist/index.mjs')).href);
  const packageDom = await import(pathToFileURL(path.join(consumerRoot,'node_modules/@uifn/dom/dist/index.mjs')).href);
  const sourceCoreModule = await import(pathToFileURL(sourceCore).href); const sourceDomModule = await import(pathToFileURL(sourceDom).href);
  for (const [label,module] of [['package',packageDom],['source',sourceDomModule]]) {
    for (const symbol of ['createUIFnMenuDomBinding','createUIFnNavigationMenuDomBinding','createUIFnRovingFocusDomBinding','isUIFnPointInPointerGraceTriangle']) if (typeof module[symbol] !== 'function') throw new Error(`${label} DOM export ${symbol} missing`);
  }
  const { exercise } = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
  const packageCount = await exercise(packageCore,'package'); const sourceCount = await exercise(sourceCoreModule,'source');
  const result = { ok: packageCount === 21 && sourceCount === 21, command: 'verify:uifn-navigation-pack', primitives: 7, frameworks: ['react','svelte','solid'], modes: { package: packageCount, source: sourceCount }, byteIdentical: true, distSha256: packed, tarballs: tarballs.map((file) => ({ file, sha256: sha256(path.join(packRoot,file)) })), temporaryRoot: tempRoot };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result,null,2)); process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-navigation-pack', temporaryRoot: tempRoot, error: error instanceof Error ? error.message : String(error) },null,2)); process.exit(1);
}
