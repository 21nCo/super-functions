import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

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
    const require = createRequire(new URL(relative, import.meta.url));
    const entry = require.resolve(db.name);
    const installed = JSON.parse(readFileSync(new URL("../package.json", pathToFileURL(entry)), "utf8"));
    expect(installed.version).toBe(db.version);
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
