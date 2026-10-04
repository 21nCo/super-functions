import { expect, it } from "vitest";
import { createServer } from "vite";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { docsSiteCorePlugin } from "./vite";

it("uses actual consumer-owned provider-fs and Vitest subpath exports through real Vite resolution", async () => {
  const plugin = docsSiteCorePlugin(pathToFileURL(resolve(process.cwd(), "package.json")).href);
  const server = await createServer({ configFile: false, plugins: [plugin], server: { middlewareMode: true }, logLevel: "silent" });
  try {
    for (const [source, name, version] of [["@docsfn/provider-fs", "@docsfn/provider-fs", "0.0.2"], ["vitest/config", "vitest", "4.1.11"]]) {
      const entry = await server.pluginContainer.resolveId(source, resolve(process.cwd(), "../../scripts/docs-site/runtime.ts"), { ssr: true });
      expect(entry).toBeTruthy();
      if (!entry) throw new Error("Actual Vite resolver must find the declared consumer package");
      let owner = dirname(entry.id);
      while (!existsSync(join(owner, "package.json"))) {
        const parent = dirname(owner);
        if (parent === owner) throw new Error("Resolved dependency must have a physical owner");
        owner = parent;
      }
      const metadata: unknown = JSON.parse(readFileSync(join(owner, "package.json"), "utf8"));
      expect(metadata).toMatchObject({ name, version });
    }
  } finally { await server.close(); }
});

it("rejects malformed actual JSON dependency maps before consumer resolution", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-package-declaration-"));
  try {
    for (const metadata of [null, [], { dependencies: [] }, { dependencies: { "@docsfn/core": 5 } }, { dependencies: { "@docsfn/core": "0.0.5" }, devDependencies: "bad" }]) {
      writeFileSync(join(dir, "package.json"), JSON.stringify(metadata));
      expect(() => docsSiteCorePlugin(pathToFileURL(join(dir, "vite.config.ts")).href)).toThrow(/Invalid docs/);
    }
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@docsfn/core": "0.0.5" } }));
    expect(() => docsSiteCorePlugin(pathToFileURL(join(dir, "vite.config.ts")).href)).not.toThrow();
  } finally { rmSync(dir, { recursive: true }); }
});
