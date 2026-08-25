import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { processBirthSignature, processExists } from "./process-identity.js";

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

interface TrustLockTicket { token: string; pid: number; birthSignature?: string; createdAt: string; number?: number }

async function readTicket(filePath: string): Promise<TrustLockTicket | undefined> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as TrustLockTicket; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function staleTicket(filePath: string, ticket: TrustLockTicket | undefined, staleMs: number): Promise<boolean> {
  const createdAt = ticket?.createdAt ? Date.parse(ticket.createdAt) : await stat(filePath).then((value) => value.mtimeMs).catch(() => Date.now());
  if (!Number.isFinite(createdAt) || Date.now() - createdAt <= staleMs) return false;
  if (!ticket?.pid) return true;
  if (!processExists(ticket.pid)) return true;
  if (!ticket.birthSignature) return false;
  const currentSignature = await processBirthSignature(ticket.pid);
  return currentSignature !== undefined && currentSignature !== ticket.birthSignature;
}

async function ticketPaths(lockPath: string): Promise<string[]> {
  return (await readdir(lockPath)).filter((name) => name.endsWith(".choosing") || name.endsWith(".ticket")).map((name) => path.join(lockPath, name));
}

async function cleanStaleTickets(lockPath: string, ownPaths: Set<string>, staleMs: number): Promise<void> {
  for (const filePath of await ticketPaths(lockPath)) {
    if (ownPaths.has(filePath)) continue;
    let ticket: TrustLockTicket | undefined;
    try { ticket = await readTicket(filePath); }
    catch (error) {
      if (await staleTicket(filePath, undefined, staleMs)) { await rm(filePath, { force: true }); continue; }
      throw error;
    }
    if (ticket && await staleTicket(filePath, ticket, staleMs)) await rm(filePath, { force: true });
  }
}

async function writeTicket(filePath: string, ticket: TrustLockTicket): Promise<void> {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(ticket), { mode: 0o600, flag: "wx" });
    await rename(temp, filePath);
  } finally { await rm(temp, { force: true }).catch(() => undefined); }
}

async function withTrustLock<T>(stateDir: string, action: () => Promise<T>): Promise<T> {
  const lockPath = path.join(stateDir, "trust.lock");
  await mkdir(lockPath, { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const choosingPath = path.join(lockPath, `${token}.choosing`);
  const ticketPath = path.join(lockPath, `${token}.ticket`);
  const ownPaths = new Set([choosingPath, ticketPath]);
  const staleMs = 300_000;
  const deadline = Date.now() + 10_000;
  const baseTicket: TrustLockTicket = { token, pid: process.pid, ...(await processBirthSignature(process.pid).then((birthSignature) => birthSignature ? { birthSignature } : {})), createdAt: new Date().toISOString() };
  await writeTicket(choosingPath, baseTicket);
  try {
    await cleanStaleTickets(lockPath, ownPaths, staleMs);
    const tickets = await Promise.all((await ticketPaths(lockPath)).filter((filePath) => filePath.endsWith(".ticket")).map(readTicket));
    const number = Math.max(0, ...tickets.map((ticket) => Number.isInteger(ticket?.number) ? ticket!.number! : 0)) + 1;
    await writeTicket(ticketPath, { ...baseTicket, number });
    await rm(choosingPath, { force: true });
    while (true) {
      await cleanStaleTickets(lockPath, ownPaths, staleMs);
      const others = (await ticketPaths(lockPath)).filter((filePath) => !ownPaths.has(filePath));
      let blocked = others.some((filePath) => filePath.endsWith(".choosing"));
      if (!blocked) {
        for (const filePath of others.filter((candidate) => candidate.endsWith(".ticket"))) {
          const ticket = await readTicket(filePath);
          if (!ticket || !Number.isInteger(ticket.number) || ticket.number! < number || (ticket.number === number && ticket.token < token)) { blocked = true; break; }
        }
      }
      if (!blocked) break;
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring trust-state lock ${lockPath}.`);
      await delay(20 + Math.floor(Math.random() * 20));
    }
    return await action();
  } finally {
    await rm(choosingPath, { force: true }).catch(() => undefined);
    await rm(ticketPath, { force: true }).catch(() => undefined);
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
