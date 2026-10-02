import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
function removeFixture(base){
 // Local authorship observers can append a note during recursive deletion.
 // Restart traversal, rather than merely retrying rmdir on a now-nonempty parent.
 for(let attempt=0;;attempt++){
  try{return rmSync(base,{recursive:true,force:true,maxRetries:3,retryDelay:25});}
  catch(error){if(error.code!=="ENOTEMPTY"||attempt>=3)throw error;}
 }
}
it.each(["docsfn", "runtime", "runtime-search", "runtime-docsfn", "reviewfn"])("actual Git selector composes committed consumers (%s)",kind=>{
 const base=mkdtempSync(join(tmpdir(),"docs-selector-"));
 function put(file,text){const p=join(base,file);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text);}
 function git(...args){return execFileSync("git",args,{cwd:base,encoding:"utf8"}).trim();}
 try{
  for(const file of ["scripts/cloudflare-docs/config.mjs","scripts/cloudflare-docs/select-products.mjs"])put(file,readFileSync(join(root,file)));
  for(const id of ["reviewfn","datafn","filefn","searchfn","authfn"])put(`${id}/docs/package.json`,JSON.stringify({name:`@${id}/docs`}));
  for(const id of ["reviewfn","authfn","filefn"])put(`${id}/docs/src/lib/server/docs-site-source.ts`,'import { createDocsSiteRuntime } from "../../../../../scripts/docs-site/runtime";');
  git("init","-q");git("config","core.hooksPath","/dev/null");git("config","core.fsmonitor","false");git("config","gc.auto","0");git("config","user.name","Docs fixture");git("config","user.email","fixture@example.invalid");git("add",".");git("commit","-qm","before");const before=git("rev-parse","HEAD");
  if(kind==="docsfn"||kind==="runtime-docsfn")put("apifn/docsfn/probe.ts","// shared DocsFn change");
  if(kind.startsWith("runtime"))put("scripts/docs-site/probe.ts","// shared runtime change");
  if(kind==="runtime-search")put("searchfn/docs/probe.md","# Other consumer change");
  if(kind==="reviewfn")put("reviewfn/docs/probe.md","# Product-only change");
  git("add",".");git("commit","-qm","after");const after=git("rev-parse","HEAD");
  // Working-tree wrappers must not override the committed deployment head.
  put("searchfn/docs/src/lib/server/docs-site-source.ts",'import "../../../../../scripts/docs-site/runtime";');
  const output=execFileSync(process.execPath,["scripts/cloudflare-docs/select-products.mjs"],{cwd:base,encoding:"utf8",env:{...process.env,EVENT_NAME:"push",REF_TYPE:"branch",REF_NAME:"dev",BEFORE:before,AFTER:after}});
  const expected=kind.includes("docsfn")?["reviewfn","datafn","filefn","searchfn","authfn"]:kind==="runtime-search"?["reviewfn","authfn","filefn","searchfn"]:kind==="reviewfn"?["reviewfn"]:["reviewfn","authfn","filefn"];
  expect(new Set(JSON.parse(output.match(/^products=(.*)$/m)[1]))).toEqual(new Set(expected));
  const workflow=readFileSync(join(root,".github/workflows/superfunctions-docs-cloudflare-deploy.yml"),"utf8");
  expect(workflow).toContain("scripts/docs-site/**");expect(workflow).toContain("apifn/docsfn/**");
 }finally{removeFixture(base);}
});
