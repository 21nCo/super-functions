import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { DevFnConfigError } from "./errors.js";

async function nearestExistingParent(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function resolveContainedPath(root: string, candidate: string, field = "path"): Promise<string> {
  const resolvedRoot = await realpath(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new DevFnConfigError("DEVFN_CONFIG_PATH_ESCAPE", `${field} must stay inside the repository.`, field);
  }
  const existingParent = await nearestExistingParent(resolved);
  const canonicalParent = await realpath(existingParent);
  if (canonicalParent !== resolvedRoot && !canonicalParent.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new DevFnConfigError("DEVFN_CONFIG_PATH_ESCAPE", `${field} resolves outside the repository through a symlink.`, field);
  }
  return resolved;
}
