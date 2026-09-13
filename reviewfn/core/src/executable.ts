import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

/** Resolve trusted host tooling before spawning; reject relative and world-writable PATH entries. */
export async function resolveTrustedExecutable(name: string, searchPath = process.env.PATH ?? ""): Promise<string> {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Expected an executable name.");
  for (const directory of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory) || path.resolve(directory) === process.cwd()) continue;
    try {
      const parent = await stat(directory);
      if (!parent.isDirectory() || (parent.mode & 0o002) !== 0) continue;
      const executable = await realpath(path.join(directory, name));
      const file = await stat(executable);
      if (!file.isFile() || (file.mode & 0o002) !== 0) continue;
      await access(executable, constants.X_OK);
      return executable;
    } catch { /* Try the next trusted directory. */ }
  }
  throw new Error(`No trusted executable found for ${name}.`);
}
