import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { processBirthSignature, processIdentityStatus } from "@devfn/processes";

import { PortRegistryError } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const heldRoutingLocks = new AsyncLocalStorage<ReadonlySet<string>>();

const ROUTING_LOCK_TIMEOUT_MS = 180_000;
// A verified-dead holder's lock is recovered well within a waiter's budget.
const ROUTING_LOCK_STALE_MS = 60_000;

/** Serialize lease and route mutations, including a replacement's teardown. */
export async function withRoutingLock<T>(stateDir: string, action: () => Promise<T>): Promise<T> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  // Any spelling of the directory names the same lock for re-entry.
  const lockPath = path.join(await realpath(stateDir), "routing.lock");
  if (heldRoutingLocks.getStore()?.has(lockPath)) return await action();
  return await withFileLock(lockPath, async () =>
    await heldRoutingLocks.run(new Set([...(heldRoutingLocks.getStore() ?? []), lockPath]), action),
  { timeoutMs: ROUTING_LOCK_TIMEOUT_MS, staleMs: ROUTING_LOCK_STALE_MS });
}

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
        const owner = observed.pid ? await processIdentityStatus(observed.pid, observed.birthSignature, observed.createdAt) : "exited";
        const birthSignaturesSupported = process.platform === "linux" || process.platform === "darwin" || process.platform === "win32";
        const ownerMatches = owner === "running" || owner === "unverified";
        recover = birthSignaturesSupported && !ownerMatches && Boolean(observed.createdAt) && Date.now() - Date.parse(observed.createdAt!) > staleMs;
      } catch (ownerError) {
        if ((ownerError as NodeJS.ErrnoException).code !== "ENOENT") throw ownerError;
        const mtime = await stat(lockPath).then((value) => value.mtimeMs).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return Date.now();
          throw error;
        });
        const birthSignaturesSupported = process.platform === "linux" || process.platform === "darwin" || process.platform === "win32";
        recover = birthSignaturesSupported && Date.now() - mtime > staleMs;
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
