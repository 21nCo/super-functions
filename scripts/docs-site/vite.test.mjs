import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { docsSiteCorePlugin } from "./vite";
function put(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
}
function pkg(directory, name, marker) {
  const root = path.join(directory, "node_modules", name);
  put(path.join(root, "package.json"), { name, type: "module", exports: {
    ".": { browser: "./lib/browser.mjs", import: "./lib/import.mjs", require: "./lib/require.cjs" },
    "./search-runtime": { import: "./lib/search.mjs", require: "./lib/search.cjs" },
  } });
  for (const [file, value] of [["browser.mjs", `${marker}_BROWSER`], ["import.mjs", `${marker}_IMPORT`], ["search.mjs", `${marker}_SEARCH`]]) {
    put(path.join(root, "lib", file), `export const marker = ${JSON.stringify(value)};`);
  }
  put(path.join(root, "lib/require.cjs"), `exports.marker = '${marker}_REQUIRE';`);
  put(path.join(root, "lib/search.cjs"), `exports.marker = '${marker}_REQUIRE_SEARCH';`);
}

describe("consumer-owned conditional dependency resolution", () => {
  it("honors real Vite import/browser/subpath/parser conditions without borrowing root or overriding dependency owners", async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "docs-conditional-")));
    const site = path.join(root, "consumer", "docs");
    const shared = path.join(root, "scripts", "docs-site", "entry.js");
    const ownedDependency = path.join(site, "node_modules", "owned-dependency");
    let server;
    try {
      put(path.join(root, "package.json"), { type: "module" });
      put(path.join(site, "package.json"), { type: "module", dependencies: { "@docsfn/core": "0.0.5", "gray-matter": "4.0.3" } });
      for (const name of ["@docsfn/core", "gray-matter"]) {
        pkg(root, name, "ROOT_BAD"); pkg(site, name, "CONSUMER_OK");
      }
      pkg(ownedDependency, "@docsfn/core", "DEPENDENCY_OK");
      put(path.join(ownedDependency, "entry.js"), 'export { marker } from "@docsfn/core";');
      put(shared, 'import { marker as core } from "@docsfn/core"; import { marker as search } from "@docsfn/core/search-runtime"; import { marker as parser } from "gray-matter"; export { core, search, parser };');
      server = await createServer({ configFile: false, root: site,
        plugins: [docsSiteCorePlugin(pathToFileURL(path.join(site, "vite.config.ts")).href)],
        ssr: { noExternal: true }, optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, fs: { allow: [root] } },
      });
      const loaded = await server.ssrLoadModule(shared);
      expect([loaded.core, loaded.search, loaded.parser]).toEqual(["CONSUMER_OK_IMPORT", "CONSUMER_OK_SEARCH", "CONSUMER_OK_IMPORT"]);
      const browser = await server.transformRequest(shared);
      expect(browser.code).toContain("lib/browser.mjs");
      expect(browser.code).not.toContain("ROOT_BAD");
      const dependency = await server.ssrLoadModule(path.join(ownedDependency, "entry.js"));
      expect(dependency.marker).toBe("DEPENDENCY_OK_IMPORT");
    } finally { await server?.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it("fails fast without an explicit consumer dependency owner", () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "docs-missing-owner-")));
    try {
      put(path.join(root, "package.json"), { type: "module" });
      expect(() => docsSiteCorePlugin(pathToFileURL(path.join(root, "vite.config.ts")).href)).toThrow("consumer declaring @docsfn/core");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
