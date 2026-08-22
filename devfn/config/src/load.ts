import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { ConfigLoaderError, loadConfig } from "@clifn/core";

import { DevFnConfigError } from "./errors.js";
import { validateDevFnConfig, validateDevFnPolicy } from "./schema.js";
import type { DevFnConfig, DevFnPolicy } from "./types.js";

export const DEVFN_CONFIG_CANDIDATES = [
  "devfn.config.ts",
  "devfn.config.js",
  "devfn.config.mjs",
  "devfn.config.cjs",
  "devfn.config.json",
] as const;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findDevFnRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    for (const candidate of DEVFN_CONFIG_CANDIDATES) {
      if (await exists(path.join(current, candidate))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `No DevFn manifest found from ${start}.`);
    }
    current = parent;
  }
}

export async function resolveDevFnManifestPath(options: { cwd?: string; configPath?: string } = {}): Promise<{ root: string; path: string }> {
  if (options.configPath) {
    const resolved = path.resolve(options.cwd ?? process.cwd(), options.configPath);
    if (!await exists(resolved)) throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `Config file not found: ${resolved}`);
    return { root: path.dirname(resolved), path: resolved };
  }
  const root = await findDevFnRoot(options.cwd);
  for (const candidate of DEVFN_CONFIG_CANDIDATES) {
    const resolved = path.join(root, candidate);
    if (await exists(resolved)) return { root, path: resolved };
  }
  throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `No DevFn manifest found from ${options.cwd ?? process.cwd()}.`);
}

export async function loadDevFnConfig(options: { cwd?: string; configPath?: string } = {}): Promise<{ config: DevFnConfig; path: string; root: string }> {
  try {
    const resolved = await resolveDevFnManifestPath(options);
    const root = resolved.root;
    const loaded = await loadConfig<DevFnConfig>({
      cwd: root,
      configPath: resolved.path,
      candidates: DEVFN_CONFIG_CANDIDATES,
      exportNames: ["config", "devfnConfig"],
      validate: validateDevFnConfig,
    });
    return { ...loaded, root };
  } catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    if (error instanceof ConfigLoaderError) {
      throw new DevFnConfigError(
        error.code === "CLIFN_CONFIG_NOT_FOUND" ? "DEVFN_CONFIG_NOT_FOUND" : "DEVFN_CONFIG_INVALID",
        error.message,
      );
    }
    throw error;
  }
}

export async function loadDevFnPolicy(root: string, configuredPath?: string): Promise<{ policy: DevFnPolicy; path: string } | null> {
  const candidate = configuredPath ?? "devfn.policy.json";
  const policyPath = path.resolve(root, candidate);
  if (!await exists(policyPath)) return null;
  const raw = await readFile(policyPath, "utf8");
  try {
    return { policy: validateDevFnPolicy(JSON.parse(raw)), path: policyPath };
  } catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    throw new DevFnConfigError("DEVFN_CONFIG_INVALID", `Invalid policy JSON at ${policyPath}.`);
  }
}
