import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPackedUI } from './packed-ui.mjs';
test('rejects destinations outside the controlled temporary namespace', async()=>{
 const root=mkdtempSync(join(tmpdir(),'unrelated-ui-'));
 try{await assert.rejects(verifyPackedUI(root));assert.equal(existsSync(join(root,'App.svelte')),false);}
 finally{rmSync(root,{recursive:true});}
});
test('never overwrites a pre-existing symlink destination',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sfns4-packed-'));
 const protectedDir=mkdtempSync(join(tmpdir(),'protected-ui-'));
 const target=join(protectedDir,'source');writeFileSync(target,'preserve');
 symlinkSync(target,join(root,'App.svelte'));
 try{await assert.rejects(verifyPackedUI(root));assert.equal(readFileSync(target,'utf8'),'preserve');}
 finally{rmSync(root,{recursive:true});rmSync(protectedDir,{recursive:true});}
});
