import { it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
it.skipIf(process.platform === "win32")("workflow and executing selector deploy active shared consumers, composing mixed changes", () => {
  expect(readFileSync(join(root, ".github/workflows/superfunctions-docs-cloudflare-deploy.yml"), "utf8")).toMatch(/^\s+- scripts\/docs-site\/\*\*$/m);
  const base = mkdtempSync(join(tmpdir(), "docs-selector-"));
  function put(file, text, mode) {
    const target = join(base, file);mkdirSync(dirname(target), { recursive: true });writeFileSync(target, text, mode ? { mode } : undefined);
  }
  try {
    for (const file of ["scripts/cloudflare-docs/config.mjs", "scripts/cloudflare-docs/select-products.mjs"]) put(file, readFileSync(join(root, file)));
    for (const product of ["authfn", "filefn", "datafn", "searchfn"]) put(`${product}/docs/package.json`, "{}");
    for (const product of ["authfn", "filefn"]) put(`${product}/docs/src/lib/server/docs-site-source.ts`, readFileSync(join(root, product, "docs/src/lib/server/docs-site-source.ts")));
    put("searchfn/docs/src/lib/server/docs-site-source.ts", "export const localRuntime = true;");
    put("bin/git", `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if(args[0] === 'diff') process.stdout.write(process.env.CHANGED_FILES);
else if(args[0] === 'show') {
  const path = args[1].slice(args[1].indexOf(':') + 1);
  if(fs.existsSync(path)) process.stdout.write(fs.readFileSync(path)); else process.exit(128);
} else process.exit(99);
`, 0o755);
    const select = (files) => {
      const output = execFileSync(process.execPath, ["scripts/cloudflare-docs/select-products.mjs"], {
        cwd: base, encoding: "utf8", env: { ...process.env, PATH: `${join(base, "bin")}:${process.env.PATH}`, EVENT_NAME: "push", REF_TYPE: "branch", BEFORE: "old", AFTER: "new", CHANGED_FILES: files.join("\n") },
      });
      expect(output).toContain("environment=dev");
      return JSON.parse(output.split("products=")[1].trim()).sort();
    };
    expect(select(["scripts/docs-site/Search.svelte"])).toEqual(["authfn", "filefn"]);
    expect(select(["scripts/docs-site/runtime.ts", "searchfn/docs/README.md"])).toEqual(["authfn", "filefn", "searchfn"]);
    expect(select(["datafn/docs/README.md"])).toEqual(["datafn"]);
    expect(select(["unrelated.txt"])).toEqual([]);
    expect(select(["scripts/docs-site/runtime.ts", "package-lock.json"])).toEqual(["authfn", "datafn", "filefn", "searchfn"]);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
