import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface TrustRecord { root: string; configPath: string; digest: string; trustedAt: string }
interface TrustState { version: 1; records: TrustRecord[] }

export function defaultStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.XDG_STATE_HOME ? path.join(env.XDG_STATE_HOME, "devfn") : path.join(os.homedir(), ".local", "state", "devfn");
}

export async function configDigest(configPath: string): Promise<string> {
  return createHash("sha256").update(await readFile(configPath)).digest("hex");
}

async function readTrust(filePath: string): Promise<TrustState> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as TrustState;
    return value.version === 1 && Array.isArray(value.records) ? value : { version: 1, records: [] };
  } catch { return { version: 1, records: [] }; }
}

export async function isProjectTrusted(root: string, configPath: string, stateDir = defaultStateDir()): Promise<boolean> {
  const digest = await configDigest(configPath);
  const state = await readTrust(path.join(stateDir, "trust.json"));
  return state.records.some((record) => record.root === root && record.configPath === configPath && record.digest === digest);
}

export async function trustProject(root: string, configPath: string, stateDir = defaultStateDir()): Promise<void> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(stateDir, "trust.json");
  const state = await readTrust(filePath);
  const digest = await configDigest(configPath);
  const next: TrustState = {
    version: 1,
    records: [
      ...state.records.filter((record) => !(record.root === root && record.configPath === configPath)),
      { root, configPath, digest, trustedAt: new Date().toISOString() },
    ],
  };
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, filePath);
}
