import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { PortRegistryError } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withFileLock<T>(lockPath: string, action: () => Promise<T>, options: { timeoutMs?: number; staleMs?: number } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const staleMs = options.staleMs ?? 300_000;
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await mkdir(lockPath);
      await writeFile(`${lockPath}/owner.json`, JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600 });
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const observed = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as { token: string; pid: number; createdAt: string };
        let alive = true;
        try { process.kill(observed.pid, 0); } catch (killError) { alive = (killError as NodeJS.ErrnoException).code === "EPERM"; }
        if (!alive && Date.now() - Date.parse(observed.createdAt) > staleMs) {
          const quarantine = `${lockPath}.stale.${observed.token}`;
          await rename(lockPath, quarantine);
          const moved = JSON.parse(await readFile(`${quarantine}/owner.json`, "utf8")) as { token?: string };
          if (moved.token !== observed.token) throw new Error(`Lock ownership changed while recovering ${lockPath}.`);
          await rm(quarantine, { recursive: true });
          continue;
        }
      } catch (recoveryError) {
        if ((recoveryError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw recoveryError;
      }
      if (Date.now() >= deadline) throw new PortRegistryError("DEVFN_REGISTRY_LOCK_TIMEOUT", `Timed out acquiring registry lock ${lockPath}.`);
      await delay(20 + Math.floor(Math.random() * 20));
    }
  }
  try { return await action(); }
  finally {
    try {
      const owner = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as { token?: string };
      if (owner.token === token) await rm(lockPath, { recursive: true, force: true });
    } catch { /* Never remove a lock whose ownership cannot be proven. */ }
  }
}
