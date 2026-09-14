import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLibraryInitializations } from "../utils/parse-library-init.js";

it.each(["langfn", "memoryfn"])("discovers documented %s initialization using package metadata", name => {
  const manifest = JSON.parse(readFileSync(new URL(`../../../../${name}/typescript/package.json`, import.meta.url), "utf8"));
  expect(manifest.superfunctions.initFunction).toBe(name);
  const directory = mkdtempSync(join(tmpdir(), "sfns4-init-"));
  try {
    const file = join(directory, "init.ts");
    writeFileSync(file, `${name}({ storage: { kind: "memory" } });`);
    const registry = { [manifest.superfunctions.initFunction]: manifest.name };
    expect(parseLibraryInitializations(file, registry)).toMatchObject([{ functionName: name, packageName: manifest.name }]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
