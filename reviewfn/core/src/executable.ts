import { access, lstat, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

/** Resolve trusted host tooling before spawning; reject relative and world-writable PATH entries. */
export async function resolveTrustedExecutable(name: string, searchPath = process.env.PATH ?? ""): Promise<string> {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Expected an executable name.");
  const cwd = await realpath(process.cwd());
  for (const directory of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory) || path.resolve(directory) === process.cwd()) continue;
    try {
      const canonicalDirectory = await realpath(directory);
      if (canonicalDirectory === cwd || canonicalDirectory.startsWith(`${cwd}${path.sep}`)) continue;
      const parent = await stat(canonicalDirectory);
      if (!parent.isDirectory() || (parent.mode & 0o002) !== 0) continue;
      const executable = await realpath(path.join(directory, name));
      if (executable === cwd || executable.startsWith(`${cwd}${path.sep}`)) continue;
      let trusted = true;
      for (const location of [canonicalDirectory, path.dirname(executable)]) {
      let ancestor = location;
      while (true) {
        const info = await stat(ancestor);
        if ((info.mode & 0o002) !== 0 || await lstat(path.join(ancestor, ".git")).catch(() => undefined)) { trusted = false; break; }
        const next = path.dirname(ancestor);
        if (next === ancestor) break;
        ancestor = next;
      }
      }
      if (!trusted) continue;
      const file = await stat(executable);
      if (!file.isFile() || (file.mode & 0o002) !== 0) continue;
      await access(executable, constants.X_OK);
      return executable;
    } catch { /* Try the next trusted directory. */ }
  }
  throw new Error(`No trusted executable found for ${name}.`);
}
