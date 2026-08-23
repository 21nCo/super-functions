import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

import { processBirthSignature, processExists } from "@devfn/processes";

import { PortRegistryError } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withFileLock<T>(lockPath: string, action: () => Promise<T>, options: { timeoutMs?: number; staleMs?: number } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const staleMs = options.staleMs ?? 300_000;
  const token = randomUUID();
  const ownerBirth = await processBirthSignature(process.pid);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await mkdir(lockPath);
      const ownerTemp = `${lockPath}/owner.${token}.tmp`;
      try {
        await writeFile(ownerTemp, JSON.stringify({ token, pid: process.pid, birthSignature: ownerBirth, createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
        await rename(ownerTemp, `${lockPath}/owner.json`);
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      let recover = false;
      let observedToken = "ownerless";
      try {
        const observed = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as { token?: string; pid?: number; birthSignature?: string; createdAt?: string };
        observedToken = observed.token ?? observedToken;
        const alive = observed.pid ? processExists(observed.pid) : false;
        const currentBirth = observed.pid ? await processBirthSignature(observed.pid) : undefined;
        const ownerMatches = observed.birthSignature ? (currentBirth === undefined ? alive : currentBirth === observed.birthSignature) : alive;
        recover = !ownerMatches && Boolean(observed.createdAt) && Date.now() - Date.parse(observed.createdAt!) > staleMs;
      } catch (ownerError) {
        if ((ownerError as NodeJS.ErrnoException).code !== "ENOENT") throw ownerError;
        const mtime = await stat(lockPath).then((value) => value.mtimeMs).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return Date.now();
          throw error;
        });
        recover = Date.now() - mtime > staleMs;
      }
      if (recover) {
        const quarantine = `${lockPath}.stale.${observedToken}.${randomUUID()}`;
        try { await rename(lockPath, quarantine); await rm(quarantine, { recursive: true, force: true }); }
        catch (recoveryError) { if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT") throw recoveryError; }
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
