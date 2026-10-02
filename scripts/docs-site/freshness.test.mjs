import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root=fileURLToPath(new URL("../../",import.meta.url));const site=fileURLToPath(new URL("../../plugfn/docs/",import.meta.url));
const {parse}=createRequire(site+"package.json")("yaml");
it("executing CI checks committed references and corpus before prebuild can rewrite them",()=>{
 const steps=parse(readFileSync(root+".github/workflows/ci.yml","utf8")).jobs.javascript.steps;
 const build=steps.findIndex(step=>step.name==="Build");
 for(const [name,command] of [["Check PlugFn docs reference mirrors","check:references"],["Check PlugFn docs LLM artifacts","check:llms"]]){
  const check=steps.findIndex(step=>step.name===name);
  expect(check).toBeGreaterThan(-1);expect(check).toBeLessThan(build);expect(steps[check].run).toBe(`npm run ${command} --workspace @plugfn/docs`);
  execFileSync("npm",["run",command,"--workspace","@plugfn/docs"],{cwd:root,stdio:"pipe"});
 }
});
it("nonwriting LLM CLI rejects stale committed bytes and leaves them intact",()=>{
 const file=site+"static/llms.txt";const before=readFileSync(file);const stale=Buffer.from("stale-committed-artifact-fixture\n");
 try{writeFileSync(file,stale);const result=spawnSync(process.execPath,["scripts/generate-llms.mjs","--check"],{cwd:site,encoding:"utf8"});expect(result.status).not.toBe(0);expect(result.stderr).toContain("llms.txt is stale");expect(readFileSync(file)).toEqual(stale);}
 finally{writeFileSync(file,before);}
});
it.each(["readiness","release-gates","client-boundary"])("nonwriting reference CLI rejects stale %s mirror without altering it",name=>{
 const file=site+`content/docs/reference/${name}.md`;const before=readFileSync(file);const stale=Buffer.from("stale-reference-mirror-fixture\n");
 try{writeFileSync(file,stale);const result=spawnSync(process.execPath,["scripts/sync-references.mjs","--check"],{cwd:site,encoding:"utf8"});expect(result.status).not.toBe(0);expect(result.stderr).toContain(`${name} reference is stale`);expect(readFileSync(file)).toEqual(stale);}
 finally{writeFileSync(file,before);}
});
