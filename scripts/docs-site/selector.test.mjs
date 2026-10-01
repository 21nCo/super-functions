import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
it.each([false,true])("real Git changed-file selection restores DocsFn and composes mixed changes (%s)", mixed=>{
 const base=mkdtempSync(join(tmpdir(),"docs-selector-"));
 function put(file,text){const p=join(base,file);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text);}
 function git(...args){return execFileSync("git",args,{cwd:base,encoding:"utf8"}).trim();}
 try{
  for(const file of ["scripts/cloudflare-docs/config.mjs","scripts/cloudflare-docs/select-products.mjs"])put(file,readFileSync(join(root,file)));
  for(const id of ["mcpfn","datafn","filefn","searchfn","authfn"])put(`${id}/docs/package.json`,JSON.stringify({name:`@${id}/docs`}));
  git("init","-q");git("config","core.hooksPath","/dev/null");git("config","core.fsmonitor","false");git("config","gc.auto","0");git("config","user.name","Docs fixture");git("config","user.email","fixture@example.invalid");git("add",".");git("commit","-qm","fixture before");const before=git("rev-parse","HEAD");
  put("docsfn/changed.ts","// actual shared source change");if(mixed)put("mcpfn/docs/content/docs/probe.md","# fixture");git("add",".");git("commit","-qm","fixture after");
  const result=execFileSync(process.execPath,["scripts/cloudflare-docs/select-products.mjs"],{cwd:base,encoding:"utf8",env:{...process.env,EVENT_NAME:"push",REF_TYPE:"branch",REF_NAME:"dev",BEFORE:before,AFTER:git("rev-parse","HEAD")}});
  expect(new Set(JSON.parse(result.match(/^products=(.*)$/m)[1]))).toEqual(new Set(["mcpfn","datafn","filefn","searchfn","authfn"]));
  expect(readFileSync(join(root,".github/workflows/superfunctions-docs-cloudflare-deploy.yml"),"utf8")).toContain("docsfn/**");
 }finally{rmSync(base,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});
