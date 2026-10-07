import { access, lstat, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

/** Resolve native host tooling; reject repository paths and POSIX world-writable entries. */
export async function resolveTrustedExecutable(name: string, searchPath = process.env.PATH ?? ""): Promise<string> {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Expected an executable name.");
  const windows = process.platform === "win32";
  // Native tools use .exe on Windows. Batch wrappers require a shell and are not accepted.
  const executableName = windows && !path.extname(name) ? `${name}.exe` : name;
  const cwd = await realpath(process.cwd());
  for (const directory of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory) || path.resolve(directory) === process.cwd()) continue;
    try {
      const canonicalDirectory = await realpath(directory);
      if (canonicalDirectory === cwd || canonicalDirectory.startsWith(`${cwd}${path.sep}`)) continue;
      const parent = await stat(canonicalDirectory);
      if (!parent.isDirectory() || !windows && (parent.mode & 0o002) !== 0) continue;
      const executable = await realpath(path.join(directory, executableName));
      if (executable === cwd || executable.startsWith(`${cwd}${path.sep}`)) continue;
      let trusted = true;
      for (const location of [canonicalDirectory, path.dirname(executable)]) {
      let ancestor = location;
      while (true) {
        const info = await stat(ancestor);
        if (!windows && (info.mode & 0o002) !== 0 || await lstat(path.join(ancestor, ".git")).catch(() => undefined)) { trusted = false; break; }
        const next = path.dirname(ancestor);
        if (next === ancestor) break;
        ancestor = next;
      }
      }
      if (!trusted) continue;
      const file = await stat(executable);
      if (!file.isFile() || !windows && (file.mode & 0o002) !== 0) continue;
      // Windows access control is governed by ACLs, not stat.mode executable/write bits.
      await access(executable, windows ? constants.F_OK : constants.X_OK);
      return executable;
    } catch { /* Try the next trusted directory. */ }
  }
  throw new Error(`No trusted executable found for ${name}.`);
}
