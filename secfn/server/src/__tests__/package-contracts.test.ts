import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { readInstalledPackage } from "./installed-package.js";

const readJson = (relative: string) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
const db = readJson("../../../../packages/db/package.json");
const lock = readJson("../../../../package-lock.json").packages;

it("requires the versioned DB isolation contract in both SecFn packages", () => {
  // 0.2.0 and 0.2.1 registry declarations lack configurableIsolation and
  // the second transaction argument; accepting either is not a repair.
  expect(db.version).toBe("0.2.2");
  for (const relative of ["../../package.json", "../../../core/package.json"]) {
    const consumer = readJson(relative);
    expect(consumer.peerDependencies[db.name]).toBe(db.version);
    expect(consumer.devDependencies[db.name]).toBe(db.version);
  }
  // Tagged server releases install only in the server; the source core
  // declaration remains checked above without requiring a sibling install.
  const installed = readInstalledPackage(new URL("../../package.json", import.meta.url), db.name);
  expect(installed.version).toBe(db.version);
});

it("reads metadata in fresh workspace and isolated server installation layouts", () => {
  const root = mkdtempSync(join(tmpdir(), "secfn-package-contract-"));
  const owner = join(root, "secfn/server/package.json");
  const workspace = join(root, "packages/db");
  const rootInstall = join(root, "node_modules", db.name);
  const serverInstall = join(dirname(owner), "node_modules", db.name);
  const writeManifest = (directory: string, manifest = db) => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  };
  try {
    writeManifest(dirname(owner), readJson("../../package.json"));
    writeManifest(workspace);
    mkdirSync(dirname(rootInstall), { recursive: true });
    symlinkSync(workspace, rootInstall, "junction");
    // Actual workspace manifest, unbuilt export, real Node search directories.
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

    // A nearer older or malformed provider cannot borrow a valid root version.
    writeManifest(rootInstall);
    writeManifest(serverInstall, { ...db, version: "0.2.1" });
    expect(readInstalledPackage(pathToFileURL(owner), db.name).version).toBe("0.2.1");
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

it("locks the matching workspace DB and preserves the older DataFn provider", () => {
  expect(lock["packages/db"].version).toBe(db.version);
  for (const consumer of ["secfn/core", "secfn/server"]) {
    expect(lock[consumer].devDependencies[db.name]).toBe(db.version);
    expect(lock[consumer].peerDependencies[db.name]).toBe(db.version);
    expect(lock[`${consumer}/node_modules/${db.name}`]).toBeUndefined();
  }
  const datafn = readJson("../../../../datafn/server/package.json");
  expect(lock[`datafn/server/node_modules/${db.name}`].version)
    .toBe(datafn.dependencies[db.name]);
});

it("retains every locked Turbo platform without upgrading the tool", () => {
  const turbo = lock["node_modules/turbo"];
  expect(turbo.version).toBe("2.6.1");
  expect(Object.keys(turbo.optionalDependencies)).toHaveLength(6);
  for (const [name, version] of Object.entries(turbo.optionalDependencies)) {
    const platform = lock[`node_modules/${name}`];
    expect(platform.version).toBe(version);
    expect(platform.optional).toBe(true);
    expect(platform.cpu).toHaveLength(1);
    expect(platform.os).toHaveLength(1);
  }
});
