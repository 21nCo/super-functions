import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root=fileURLToPath(new URL("../../",import.meta.url));const site=fileURLToPath(new URL("../../secfn/docs/",import.meta.url));
const {parse}=createRequire(site+"package.json")("yaml");
it("executing CI checks committed references and corpus before prebuild can rewrite them",()=>{
 const steps=parse(readFileSync(root+".github/workflows/ci.yml","utf8")).jobs.javascript.steps;
 const build=steps.findIndex(step=>step.name==="Build");
 for(const [name,command,product] of [["Check SecFn docs reference mirrors","check:references","secfn"],["Check SecFn docs LLM artifacts","check:llms","secfn"],["Check AuthFn docs LLM artifacts","check:llms","authfn"],["Check FileFn docs LLM artifacts","check:llms","filefn"]]){
  const check=steps.findIndex(step=>step.name===name);
  expect(check).toBeGreaterThan(-1);expect(check).toBeLessThan(build);expect(steps[check].run).toBe(`npm run ${command} --workspace @${product}/docs`);
  execFileSync("npm",["run",command,"--workspace",`@${product}/docs`],{cwd:root,stdio:"pipe"});
 }
});
it.each(["secfn","authfn","filefn"])("nonwriting %s LLM CLI rejects stale committed bytes and leaves them intact",product=>{
 const targetSite=root+`${product}/docs/`;const file=targetSite+"static/llms.txt";const before=readFileSync(file);const stale=Buffer.from("stale-committed-artifact-fixture\n");
 try{writeFileSync(file,stale);const result=spawnSync(process.execPath,["scripts/generate-llms.mjs","--check"],{cwd:targetSite,encoding:"utf8"});expect(result.status).not.toBe(0);expect(result.stderr).toContain("llms.txt is stale");expect(readFileSync(file)).toEqual(stale);}
 finally{writeFileSync(file,before);}
});
it.each(["core","runtime","server"])("nonwriting reference CLI rejects stale %s mirror without altering it",name=>{
 const file=site+`content/docs/reference/${name}.md`;const before=readFileSync(file);const stale=Buffer.from("stale-reference-mirror-fixture\n");
 try{writeFileSync(file,stale);const result=spawnSync(process.execPath,["scripts/sync-references.mjs","--check"],{cwd:site,encoding:"utf8"});expect(result.status).not.toBe(0);expect(result.stderr).toContain(`${name} reference is stale`);expect(readFileSync(file)).toEqual(stale);}
 finally{writeFileSync(file,before);}
});
