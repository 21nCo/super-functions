import { lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Inspect installed metadata, not an exported build artifact. Restrict lookup
// to the owner's ancestors so a missing install cannot borrow a global package.
export function readInstalledPackage(owner: URL, name: string): { name: string; version: string } {
  const localDirectories = new Set<string>();
  for (let directory = dirname(fileURLToPath(owner)); ; directory = dirname(directory)) {
    localDirectories.add(join(directory, "node_modules"));
    if (dirname(directory) === directory) break;
  }
  for (const directory of createRequire(owner).resolve.paths(name) ?? []) {
    if (!localDirectories.has(directory)) continue;
    const installed = join(directory, name);
    if (!lstatSync(installed, { throwIfNoEntry: false })) continue;
    // A broken nearest installation must fail, not fall through to a different
    // provider. Direct metadata access also handles package.json export guards.
    const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    if (manifest.name !== name || typeof manifest.version !== "string") {
      throw new Error(`Invalid installed metadata for ${name} at ${installed}`);
    }
    return manifest;
  }
  throw new Error(`No installed ${name} for ${fileURLToPath(owner)}`);
}
