import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { withFileLock } from "@devfn/ports";
import { matchesProcessIdentity, processBirthSignature, processExists } from "@devfn/processes";

const execFileAsync = promisify(execFile);
const PROXY_LOCK_TIMEOUT_MS = 30_000;

export interface ProxyRoute { id: string; instanceId: string; hostname: string; targetHost: string; targetPort: number; tls: "off" | "internal"; updatedAt: string }
interface ProxyState { version: 1; routes: ProxyRoute[] }
interface ProxyOwner { pid: number; birthSignature?: string }

function parseProxyOwner(value: string): ProxyOwner {
  const owner = JSON.parse(value) as Partial<ProxyOwner> | null;
  if (!owner || !Number.isInteger(owner.pid) || owner.pid! <= 0 || (owner.birthSignature !== undefined && typeof owner.birthSignature !== "string")) throw new Error("Invalid proxy owner record.");
  return owner as ProxyOwner;
}

export class ProxyError extends Error {
  public constructor(public readonly code: "DEVFN_PROXY_UNAVAILABLE" | "DEVFN_PROXY_CONFIG_INVALID" | "DEVFN_PROXY_RELOAD_FAILED" | "DEVFN_PROXY_OWNERSHIP_CONFLICT", message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ProxyError";
  }
}

export function renderCaddyfile(routes: readonly ProxyRoute[]): string {
  const lines = ["{", "  admin 127.0.0.1:2019", "}", ""];
  for (const route of [...routes].sort((a, b) => a.hostname.localeCompare(b.hostname))) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/i.test(route.hostname)) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy hostname ${route.hostname} must be a concrete .localhost name.`);
    if (route.targetHost !== "127.0.0.1" && route.targetHost !== "localhost" && route.targetHost !== "::1") throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy target ${route.targetHost} must be loopback.`);
    if (!Number.isInteger(route.targetPort) || route.targetPort < 1 || route.targetPort > 65535) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy target port ${route.targetPort} must be an integer between 1 and 65535.`);
    const targetHost = route.targetHost === "::1" ? "[::1]" : route.targetHost;
    lines.push(`${route.tls === "off" ? "http://" : ""}${route.hostname} {`, `  reverse_proxy ${targetHost}:${route.targetPort}`, ...(route.tls === "internal" ? ["  tls internal"] : []), "}", "");
  }
  return lines.join("\n");
}

export async function proxyOwnerStatus(owner: ProxyOwner): Promise<"active" | "dead" | "identity-mismatch"> {
  if (!processExists(owner.pid)) return "dead";
  return await matchesProcessIdentity(owner.pid, owner.birthSignature) ? "active" : "identity-mismatch";
}

export class CaddyProxyController {
  private readonly statePath: string;
  private readonly pendingPath: string;
  private readonly configPath: string;
  private readonly lockPath: string;
  private readonly ownerPath: string;

  public constructor(private readonly stateDir: string) {
    this.statePath = path.join(stateDir, "proxy-routes.json");
    this.pendingPath = path.join(stateDir, "proxy-routes.pending.json");
    this.configPath = path.join(stateDir, "Caddyfile");
    this.lockPath = path.join(stateDir, "proxy.lock");
    this.ownerPath = path.join(stateDir, "proxy-owner.json");
  }

  public async available(): Promise<boolean> {
    try { await execFileAsync("caddy", ["version"], { timeout: 5000 }); return true; } catch { return false; }
  }

  private async readState(file: string): Promise<ProxyState | undefined> {
    try {
      const state = JSON.parse(await readFile(file, "utf8")) as ProxyState;
      if (state.version !== 1 || !Array.isArray(state.routes)) throw new Error("Unsupported proxy route schema.");
      renderCaddyfile(state.routes);
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if (error instanceof ProxyError) throw error;
      throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Unable to read proxy route state ${file}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async read(): Promise<ProxyState> {
    const pending = await this.readState(this.pendingPath);
    if (pending) {
      await this.apply(pending, true);
      return pending;
    }
    return await this.readState(this.statePath) ?? { version: 1, routes: [] };
  }

  private async apply(next: ProxyState, recovering = false): Promise<void> {
    if (!await this.available()) throw new ProxyError("DEVFN_PROXY_UNAVAILABLE", "Caddy is required for this profile but is unavailable.");
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const candidate = `${this.configPath}.candidate`;
    await writeFile(candidate, renderCaddyfile(next.routes), { encoding: "utf8", mode: 0o600 });
    try { await execFileAsync("caddy", ["validate", "--config", candidate, "--adapter", "caddyfile"], { timeout: 10_000 }); }
    catch (error) { await rm(candidate, { force: true }); throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "Caddy rejected the generated route configuration.", { cause: error instanceof Error ? error.message : String(error) }); }
    let owner: ProxyOwner | null;
    try { owner = parseProxyOwner(await readFile(this.ownerPath, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") owner = null;
      else { await rm(candidate, { force: true }); throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "Unable to read the DevFn Caddy owner record.", { cause: error instanceof Error ? error.message : String(error) }); }
    }
    if (owner) {
      const status = await proxyOwnerStatus(owner);
      if (status === "dead") { await rm(this.ownerPath, { force: true }); owner = null; }
      else if (status === "identity-mismatch") {
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The recorded DevFn Caddy PID belongs to a different live process; refusing to replace it.");
      }
    }
    if (!owner) {
      const externalAdmin = await fetch("http://127.0.0.1:2019/config/", { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false);
      if (externalAdmin) {
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "A non-DevFn Caddy admin endpoint is already running; refusing to replace its configuration.");
      }
    }
    if (!recovering) {
      const pendingTemp = `${this.pendingPath}.${process.pid}.tmp`;
      await writeFile(pendingTemp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(pendingTemp, this.pendingPath);
    }
    if (owner) {
      try { await execFileAsync("caddy", ["reload", "--config", candidate, "--adapter", "caddyfile"], { timeout: 10_000 }); }
      catch (error) {
        await rm(candidate, { force: true });
        if (!recovering) await rm(this.pendingPath, { force: true });
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to reload the DevFn-owned Caddy proxy.", { cause: error instanceof Error ? error.message : String(error) });
      }
    } else {
      const child = spawn("caddy", ["run", "--config", candidate, "--adapter", "caddyfile"], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
      const spawnFailure = new Promise<Error | null>((resolve) => {
        child.once("error", resolve);
        child.once("exit", (code) => resolve(new Error(`Caddy exited with ${code ?? "unknown"}.`)));
      });
      const deadline = Date.now() + 10_000;
      let ready = false;
      let birthSignature: string | undefined;
      for (let attempt = 0; child.pid && attempt < 10 && !birthSignature; attempt += 1) {
        birthSignature = await processBirthSignature(child.pid);
        if (!birthSignature) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const stopSpawnedChild = async (): Promise<void> => {
        try {
          if (!child.pid) return;
          if (birthSignature && await matchesProcessIdentity(child.pid, birthSignature)) process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
          else child.kill("SIGTERM");
        } catch { /* already exited */ }
      };
      if (child.pid && birthSignature) {
        try { await writeFile(this.ownerPath, `${JSON.stringify({ pid: child.pid, birthSignature, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 }); }
        catch (error) {
          await stopSpawnedChild();
          await rm(candidate, { force: true });
          if (!recovering) await rm(this.pendingPath, { force: true });
          throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to persist the DevFn Caddy owner record.", { cause: error instanceof Error ? error.message : String(error) });
        }
      }
      while (Date.now() < deadline) {
        if (await Promise.race([spawnFailure, new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))])) break;
        if (!child.pid || !birthSignature || !await matchesProcessIdentity(child.pid, birthSignature)) break;
        ready = await fetch("http://127.0.0.1:2019/config/", { signal: AbortSignal.timeout(500) }).then(() => true).catch(() => false);
        if (ready) break;
      }
      if (!ready || !child.pid || !birthSignature) {
        await stopSpawnedChild();
        await rm(this.ownerPath, { force: true });
        await rm(candidate, { force: true });
        if (!recovering) await rm(this.pendingPath, { force: true });
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to start the DevFn-owned Caddy proxy.");
      }
      child.unref();
    }
    await rename(candidate, this.configPath);
    await rename(this.pendingPath, this.statePath);
  }

  public async upsert(routes: readonly Omit<ProxyRoute, "updatedAt">[]): Promise<ProxyRoute[]> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const ids = new Set(routes.map((route) => route.id));
      const now = new Date().toISOString();
      const nextRoutes = [...state.routes.filter((route) => !ids.has(route.id)), ...routes.map((route) => ({ ...route, updatedAt: now }))];
      const duplicate = nextRoutes.find((route, index) => nextRoutes.findIndex((candidate) => candidate.hostname === route.hostname) !== index);
      if (duplicate) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Hostname ${duplicate.hostname} is already owned by another DevFn route.`);
      await this.apply({ version: 1, routes: nextRoutes });
      return nextRoutes.filter((route) => ids.has(route.id));
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }

  public async removeInstance(instanceId: string): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const routes = state.routes.filter((route) => route.instanceId !== instanceId);
      if (routes.length !== state.routes.length) await this.apply({ version: 1, routes });
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }

  public async routes(): Promise<ProxyRoute[]> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(this.lockPath, async () => (await this.read()).routes, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }
}
