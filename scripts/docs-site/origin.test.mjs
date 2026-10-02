import { it, expect } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../../", import.meta.url));
const consumer = process.env.DOCS_SITE_DIR ? join(process.env.DOCS_SITE_DIR,"package.json") : process.env.npm_package_json ?? join(process.cwd(),"package.json");
const require = createRequire(consumer);const pins = JSON.parse(readFileSync(consumer,"utf8")).dependencies;
function put(base,file,text,mode){const target=join(base,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text,mode?{mode}:undefined);}
function execute(base,args,env={}){return execFileSync(process.execPath,args,{cwd:base,encoding:"utf8",env:{...process.env,...env}});}
it.each(["secfn","authfn","filefn"])("%s generator separates public targets from asset role, preserving defaults",product=>{
 const base=mkdtempSync(join(tmpdir(),"docs-origin-"));
 try{
  for(const file of ["package.json","docsfn.config.ts","scripts/generate-llms.mjs"])put(base,`${product}/docs/${file}`,readFileSync(join(root,product,"docs",file)));
  put(base,"scripts/docs-site/llms.mjs",readFileSync(join(root,"scripts/docs-site/llms.mjs")));
  cpSync(join(root,product,"docs/content"),join(base,product,"docs/content"),{recursive:true});mkdirSync(join(base,product,"docs/static"));mkdirSync(join(base,product,"docs/node_modules/@docsfn"),{recursive:true});
  const targetPins=JSON.parse(readFileSync(join(base,product,"docs/package.json"),"utf8")).dependencies;
  for(const dependency of ["core","provider-fs"]){expect(targetPins[`@docsfn/${dependency}`]).toBe(pins[`@docsfn/${dependency}`]);const directory=dirname(dirname(require.resolve(`@docsfn/${dependency}`)));expect(JSON.parse(readFileSync(join(directory,"package.json"),"utf8")).name).toBe(`@docsfn/${dependency}`);symlinkSync(directory,join(base,product,"docs/node_modules/@docsfn",dependency),"dir");}
  const fallback=product==="secfn"?"https://github.com/21nCo/super-functions/blob/dev/secfn/docs/content/docs/":`https://${product}.com/docs/`;
  for(const [deploy,publicOrigin,expected] of [["0","",fallback],["1",`https://dev.${product}.com`,`https://dev.${product}.com/docs/`],["1",`https://${product}.com`,`https://${product}.com/docs/`],["1","https://public.test","https://public.test/docs/"],["1","",fallback]]){
   execute(base,[`${product}/docs/scripts/generate-llms.mjs`],{CLOUDFLARE_DOCS_DEPLOY:deploy,CLOUDFLARE_DOCS_PUBLIC_ORIGIN:publicOrigin,CLOUDFLARE_DOCS_ASSETS_ORIGIN:"https://assets.test",DOCS_SOURCE_REF:"dev"});
   const outputs=["llms.txt","llms-full.txt"].map(file=>readFileSync(join(base,product,"docs/static",file),"utf8"));expect(outputs[0]).toContain(expected);
   for(const output of outputs){expect(output).not.toContain("https://assets.test");expect(output).not.toMatch(/https:\/\/(?:authfn|filefn)\.superfunctions\.dev/);}
   if(product==="secfn"){
    const indexUrl=deploy==="1"&&publicOrigin?`${publicOrigin}/docs/llms.txt`:"https://github.com/21nCo/super-functions/blob/dev/secfn/docs/static/llms.txt";
    expect(outputs[1]).toContain(`For a page index, see ${indexUrl}.`);
    if(deploy==="1"&&publicOrigin){expect(outputs[1]).toContain(`](${publicOrigin}/docs/reference/`);expect(outputs[1]).not.toMatch(/\]\(\/docs(?:[/?#)]|$)/);}
   }
  }
  if(product==="secfn"){
   execute(base,[`${product}/docs/scripts/generate-llms.mjs`],{CLOUDFLARE_DOCS_DEPLOY:"0",DOCS_SOURCE_REF:"release/v1"});expect(readFileSync(join(base,product,"docs/static/llms.txt"),"utf8")).toContain("blob/release%2Fv1/secfn/");expect(readFileSync(join(base,product,"docs/static/llms-full.txt"),"utf8")).toContain("blob/release%2Fv1/secfn/docs/static/llms.txt");
  }
 }finally{rmSync(base,{recursive:true,force:true});}
});
it.skipIf(process.platform==="win32")("executing deploy CLI forwards public origin and Node compatibility in dev/live",()=>{
 const base=mkdtempSync(join(tmpdir(),"docs-deploy-"));
 try{
  for(const file of ["scripts/cloudflare-docs/config.mjs","scripts/cloudflare-docs/deploy.mjs"])put(base,file,readFileSync(join(root,file)));
  for(const product of ["secfn","authfn","filefn"]){put(base,`${product}/docs/package.json`,readFileSync(join(root,product,"docs/package.json")));put(base,`${product}/docs/.svelte-kit/cloudflare/_worker.js`,"// controlled fixture\n");}
  put(base,"bin/npx",'#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.CAPTURE,JSON.stringify({public:process.env.CLOUDFLARE_DOCS_PUBLIC_ORIGIN,assets:process.env.CLOUDFLARE_DOCS_ASSETS_ORIGIN}));\n',0o755);
  put(base,"node_modules/.bin/wrangler",'#!/usr/bin/env node\nif(!process.argv.includes("--dry-run"))process.exit(99);\n',0o755);
  for(const product of ["secfn","authfn","filefn"])for(const environment of ["dev","live"]){const capture=join(base,"capture.json");execute(base,["scripts/cloudflare-docs/deploy.mjs",environment,`--products=${product}`,"--dry-run"],{PATH:`${join(base,"bin")}:${process.env.PATH}`,CAPTURE:capture});const host=`https://${environment==="dev"?"dev.":""}${product}.com`;expect(JSON.parse(readFileSync(capture,"utf8"))).toEqual({public:host,assets:host});expect(JSON.parse(readFileSync(join(base,product,"docs/.cloudflare-docs-wrangler.jsonc"),"utf8")).compatibility_flags).toContain("nodejs_compat");}
 }finally{rmSync(base,{recursive:true,force:true});}
}, 20_000);
