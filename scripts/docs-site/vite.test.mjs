import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { docsSiteCorePlugin } from "./vite";

it("actual Vite honors retargeted consumer import/require and search subpath exports", async () => {
  const base=mkdtempSync(join(tmpdir(),"docs-exports-"));
  const put=(name,text)=>{const file=join(base,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);};
  try {
    put("consumer/package.json",JSON.stringify({name:"@fixture/docs",type:"module"}));
    put("consumer/vite.config.mjs","export default {};");
    put("consumer/node_modules/@docsfn/core/package.json",JSON.stringify({name:"@docsfn/core",type:"module",exports:{".":{import:"./retargeted/core.mjs",require:"./retargeted/core.cjs"},"./search-runtime":{import:"./retargeted/query.mjs",require:"./retargeted/query.cjs"}}}));
    put("consumer/node_modules/@docsfn/core/retargeted/core.mjs",'export const core="IMPORT_CORE_OK";');
    put("consumer/node_modules/@docsfn/core/retargeted/core.cjs",'exports.core="REQUIRE_CORE_BAD";');
    put("consumer/node_modules/@docsfn/core/retargeted/query.mjs",'export const query="IMPORT_SEARCH_OK";');
    put("consumer/node_modules/@docsfn/core/retargeted/query.cjs",'exports.query="REQUIRE_SEARCH_BAD";');
    put("scripts/docs-site/fixture.mjs",'import {core} from "@docsfn/core";import {query} from "@docsfn/core/search-runtime";export const result=core+query;');
    const result=await build({configFile:false,root:join(base,"consumer"),logLevel:"silent",plugins:[docsSiteCorePlugin(pathToFileURL(join(base,"consumer/vite.config.mjs")).href)],build:{write:false,minify:false,lib:{entry:join(base,"scripts/docs-site/fixture.mjs"),formats:["es"]}}});
    const outputs=Array.isArray(result)?result:[result];
    const code=outputs.flatMap(output=>output.output).map(entry=>entry.code??"").join("\n");
    expect(code).toContain("IMPORT_CORE_OK");expect(code).toContain("IMPORT_SEARCH_OK");expect(code).not.toContain("REQUIRE_CORE_BAD");expect(code).not.toContain("REQUIRE_SEARCH_BAD");
  } finally {rmSync(base,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});
