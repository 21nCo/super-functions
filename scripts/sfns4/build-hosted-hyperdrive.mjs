import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const outfile=process.argv[2];
if(!outfile) throw new Error('Provide a temporary output filename');
await build({entryPoints:['scripts/sfns4/hosted-hyperdrive-worker.mjs'],outfile,bundle:true,minify:true,format:'esm',platform:'neutral',conditions:['workerd','worker','import'],loader:{'.sql':'text'},external:['node:*','cloudflare:*'],plugins:[{name:'node-prefix',setup(b){b.onResolve({filter:/^[a-z_]+(?:\/[a-z_]+)?$/},a=>builtinModules.includes(a.path)?{path:`node:${a.path}`,external:true}:undefined);}}]});
console.log(JSON.stringify({sha256:createHash('sha256').update(readFileSync(outfile)).digest('hex')}));
