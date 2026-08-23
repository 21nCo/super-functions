import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readLockOwner(lockPath: string): Promise<{ token?: string; pid?: number; createdAt?: string }> {
  try { return JSON.parse(await readFile(lockPath, "utf8")) as { token?: string; pid?: number; createdAt?: string }; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EISDIR") throw error;
    return JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8")) as { token?: string; pid?: number; createdAt?: string };
  }
}

async function withLockMutation<T>(guardPath: string, deadline: number, action: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const staleMs = 300_000;
  while (true) {
    try {
      await mkdir(guardPath, { mode: 0o700 });
      const ownerTemp = path.join(guardPath, `owner.${token}.tmp`);
      try {
        await writeFile(ownerTemp, JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
        await rename(ownerTemp, path.join(guardPath, "owner.json"));
      } catch (error) {
        await rm(guardPath, { recursive: true, force: true });
        throw error;
      }
      break;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let observedToken: string | undefined;
      let observedMtime: number | undefined;
      let recover = false;
      try {
        const observed = await readLockOwner(guardPath);
        observedToken = observed.token;
        let alive = false;
        if (observed.pid) {
          try { process.kill(observed.pid, 0); alive = true; }
          catch (killError) { alive = (killError as NodeJS.ErrnoException).code === "EPERM"; }
        }
        recover = !alive && Boolean(observed.createdAt) && Date.now() - Date.parse(observed.createdAt!) > staleMs;
      } catch (ownerError) {
        if ((ownerError as NodeJS.ErrnoException).code !== "ENOENT") throw ownerError;
        observedToken = "ownerless";
        observedMtime = await stat(guardPath).then((value) => value.mtimeMs).catch((statError) => {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw statError;
        });
        recover = observedMtime !== undefined && Date.now() - observedMtime > staleMs;
      }
      if (recover && observedToken) {
        const unchanged = observedToken === "ownerless"
          ? await stat(guardPath).then((value) => value.mtimeMs === observedMtime).catch(() => false)
          : await readLockOwner(guardPath).then((current) => current.token === observedToken).catch(() => false);
        if (unchanged) {
          const quarantine = `${guardPath}.stale.${observedToken}.${randomUUID()}`;
          try { await rename(guardPath, quarantine); await rm(quarantine, { recursive: true, force: true }); }
          catch (recoveryError) { if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT") throw recoveryError; }
        }
      }
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring trust-lock mutation guard ${guardPath}.`);
      await delay(20 + Math.floor(Math.random() * 20));
    }
  }
  try { return await action(); }
  finally {
    const owner = await readLockOwner(guardPath).catch(() => undefined);
    if (owner?.token === token) await rm(guardPath, { recursive: true, force: true });
  }
}

async function withTrustLock<T>(stateDir: string, action: () => Promise<T>): Promise<T> {
  const lockPath = path.join(stateDir, "trust.lock");
  const guardPath = `${lockPath}.guard`;
  const token = randomUUID();
  const staleMs = 300_000;
  const deadline = Date.now() + 10_000;
  let acquired = false;
  while (true) {
    await withLockMutation(guardPath, deadline, async () => {
      const pendingPath = `${lockPath}.${token}.pending`;
      try {
        await writeFile(pendingPath, JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
        try { await link(pendingPath, lockPath); acquired = true; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "EEXIST" && code !== "EISDIR") throw error;
          let recover = false;
          let observedToken = "ownerless";
          try {
            const observed = await readLockOwner(lockPath);
            observedToken = observed.token ?? observedToken;
            let alive = false;
            if (observed.pid) {
              try { process.kill(observed.pid, 0); alive = true; }
              catch (killError) { alive = (killError as NodeJS.ErrnoException).code === "EPERM"; }
            }
            recover = !alive && Boolean(observed.createdAt) && Date.now() - Date.parse(observed.createdAt!) > staleMs;
          } catch (ownerError) {
            if ((ownerError as NodeJS.ErrnoException).code !== "ENOENT") throw ownerError;
            // Never steal an ownerless legacy directory because its creator may be suspended.
          }
          if (recover) {
            const current = await readLockOwner(lockPath).catch(() => undefined);
            if (current?.token !== observedToken) return;
            const quarantine = `${lockPath}.stale.${observedToken}.${randomUUID()}`;
            try { await rename(lockPath, quarantine); await rm(quarantine, { recursive: true, force: true }); }
            catch (recoveryError) { if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT") throw recoveryError; }
          }
        }
      } finally {
        await rm(pendingPath, { force: true }).catch(() => undefined);
      }
    });
    if (acquired) break;
    if (Date.now() >= deadline) throw new Error(`Timed out acquiring trust-state lock ${lockPath}.`);
    await delay(20 + Math.floor(Math.random() * 20));
  }
  try {
    return await action();
  } finally {
    try {
      await withLockMutation(guardPath, Date.now() + 10_000, async () => {
        const owner = await readLockOwner(lockPath);
        if (owner.token === token) await rm(lockPath, { recursive: true, force: true });
      });
    } catch { /* A replaced lock is not ours to remove. */ }
  }
}

export async function readTrustedManifest(root: string, configPath: string, stateDir = defaultStateDir()): Promise<{ bytes: Buffer; digest: string }> {
  const bytes = await readFile(configPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const state = await readTrust(path.join(stateDir, "trust.json"));
  if (!state.records.some((record) => record.root === root && record.configPath === configPath && record.digest === digest)) {
    throw new Error(`DevFn manifest is not trusted: ${configPath}`);
  }
  return { bytes, digest };
}

export async function isProjectTrusted(root: string, configPath: string, stateDir = defaultStateDir()): Promise<boolean> {
  const digest = await configDigest(configPath);
  const state = await readTrust(path.join(stateDir, "trust.json"));
  return state.records.some((record) => record.root === root && record.configPath === configPath && record.digest === digest);
}

export async function trustProject(root: string, configPath: string, stateDir = defaultStateDir()): Promise<void> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await withTrustLock(stateDir, async () => {
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
    const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, filePath);
  });
}
