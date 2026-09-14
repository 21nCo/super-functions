import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadDocsConfig} from '@docsfn/core';

test('native config helpers serialize quoted source paths as data', {skip:process.platform==='win32'?'Quotes are not supported in Windows file names':false}, async () => {
  const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'docsfn-quoted-')));
  const cwd=join(root, 'quote"and\'line\nend');
  try {
    await fs.mkdir(cwd); await fs.writeFile(join(cwd,'asset.json'),'{}');
    await fs.writeFile(join(cwd,'docsfn.config.mjs'), `import {fileURLToPath} from 'node:url'; export default {schemaVersion:1,site:{title:fileURLToPath(import.meta.resolve('./asset.json'))},content:{root:import.meta.dirname}};`);
    assert.equal((await loadDocsConfig({cwd})).site.title,join(cwd,'asset.json'));
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
