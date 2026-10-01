import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root=fileURLToPath(new URL("../../",import.meta.url));const site=fileURLToPath(new URL("../../mdfn/docs/",import.meta.url));
const {parse}=createRequire(site+"package.json")("yaml");
it("executing CI checks committed artifacts before prebuild can rewrite them",()=>{
 const steps=parse(readFileSync(root+".github/workflows/ci.yml","utf8")).jobs.javascript.steps;
 const check=steps.findIndex(step=>step.name==="Check MDFN docs LLM artifacts");const build=steps.findIndex(step=>step.name==="Build");
 expect(check).toBeGreaterThan(-1);expect(check).toBeLessThan(build);expect(steps[check].run).toBe("npm run check:llms --workspace @mdfn/docs");
 execFileSync("npm",["run","check:llms","--workspace","@mdfn/docs"],{cwd:root,stdio:"pipe"});
});
it("nonwriting CLI rejects stale committed bytes and leaves them intact",()=>{
 const file=site+"static/llms.txt";const before=readFileSync(file);const stale=Buffer.from("stale-committed-artifact-fixture\n");
 try{writeFileSync(file,stale);const result=spawnSync(process.execPath,["scripts/generate-llms.mjs","--check"],{cwd:site,encoding:"utf8"});expect(result.status).not.toBe(0);expect(result.stderr).toContain("llms.txt is stale");expect(readFileSync(file)).toEqual(stale);}
 finally{writeFileSync(file,before);}
});
