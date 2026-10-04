import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { readInstalledPackage } from "./installed-package.js";

const db = { name: "@superfunctions/db", version: "1.0.0", main: "./dist/index.js" };

it("reads metadata in fresh workspace and isolated server installation layouts", () => {
  const root = mkdtempSync(join(tmpdir(), "secfn-package-contract-"));
  const owner = join(root, "secfn/server/package.json");
  const workspace = join(root, "packages/db");
  const rootInstall = join(root, "node_modules", db.name);
  const serverInstall = join(dirname(owner), "node_modules", db.name);
  const writeManifest = (directory: string, manifest: Record<string, unknown> = db) => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  };
  try {
    writeManifest(dirname(owner), { ...db, name: "@secfn/server" });
    writeManifest(workspace);
    mkdirSync(dirname(rootInstall), { recursive: true });
    symlinkSync(workspace, rootInstall, "junction");
    // A symlinked package with unbuilt exports still has resolvable metadata.
    expect(existsSync(join(workspace, "dist"))).toBe(false);
    expect(readInstalledPackage(pathToFileURL(owner), db.name).version).toBe(db.version);

    rmSync(rootInstall);
    writeManifest(serverInstall);
    expect(existsSync(join(root, "secfn/core/node_modules"))).toBe(false);
    expect(readInstalledPackage(pathToFileURL(owner), db.name).version).toBe(db.version);

    // Export depth and package.json export permissions cannot affect metadata.
    writeManifest(serverInstall, {
      ...db,
      main: "./lib/runtime/index.js",
      exports: { ".": { default: "./lib/runtime/index.js" } },
    });
    expect(readInstalledPackage(pathToFileURL(owner), db.name).version).toBe(db.version);

    // The nearest provider's metadata wins rather than borrowing root metadata.
    writeManifest(rootInstall);
    writeManifest(serverInstall, { ...db, version: "2.0.0" });
    expect(readInstalledPackage(pathToFileURL(owner), db.name).version).toBe("2.0.0");
    writeManifest(serverInstall, { ...db, name: "not-the-db-provider" });
    expect(() => readInstalledPackage(pathToFileURL(owner), db.name)).toThrow("Invalid installed metadata");
    rmSync(join(serverInstall, "package.json"));
    expect(() => readInstalledPackage(pathToFileURL(owner), db.name)).toThrow();

    rmSync(serverInstall, { recursive: true });
    symlinkSync(join(root, "unavailable-provider"), serverInstall, "junction");
    expect(() => readInstalledPackage(pathToFileURL(owner), db.name)).toThrow();
    rmSync(serverInstall);
    rmSync(rootInstall, { recursive: true });
    expect(() => readInstalledPackage(pathToFileURL(owner), db.name)).toThrow("No installed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
