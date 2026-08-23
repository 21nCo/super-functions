import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { withFileLock } from "@devfn/ports";
import { matchesProcessIdentity, processBirthSignature } from "@devfn/processes";

const execFileAsync = promisify(execFile);

export interface ProxyRoute { id: string; instanceId: string; hostname: string; targetHost: string; targetPort: number; tls: "off" | "internal"; updatedAt: string }
interface ProxyState { version: 1; routes: ProxyRoute[] }

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

export class CaddyProxyController {
  private readonly statePath: string;
  private readonly configPath: string;
  private readonly lockPath: string;
  private readonly ownerPath: string;

  public constructor(private readonly stateDir: string) {
    this.statePath = path.join(stateDir, "proxy-routes.json");
    this.configPath = path.join(stateDir, "Caddyfile");
    this.lockPath = path.join(stateDir, "proxy.lock");
    this.ownerPath = path.join(stateDir, "proxy-owner.json");
  }

  public async available(): Promise<boolean> {
    try { await execFileAsync("caddy", ["version"], { timeout: 5000 }); return true; } catch { return false; }
  }

  private async read(): Promise<ProxyState> {
    try { const state = JSON.parse(await readFile(this.statePath, "utf8")) as ProxyState; return state.version === 1 ? state : { version: 1, routes: [] }; }
    catch { return { version: 1, routes: [] }; }
  }

  private async apply(next: ProxyState): Promise<void> {
    if (!await this.available()) throw new ProxyError("DEVFN_PROXY_UNAVAILABLE", "Caddy is required for this profile but is unavailable.");
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const candidate = `${this.configPath}.candidate`;
    await writeFile(candidate, renderCaddyfile(next.routes), { encoding: "utf8", mode: 0o600 });
    try { await execFileAsync("caddy", ["validate", "--config", candidate, "--adapter", "caddyfile"], { timeout: 10_000 }); }
    catch (error) { await rm(candidate, { force: true }); throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "Caddy rejected the generated route configuration.", { cause: error instanceof Error ? error.message : String(error) }); }
    const owner = await readFile(this.ownerPath, "utf8").then((value) => JSON.parse(value) as { pid: number; birthSignature?: string }).catch(() => null);
    if (!owner) {
      const externalAdmin = await fetch("http://127.0.0.1:2019/config/", { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false);
      if (externalAdmin) {
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "A non-DevFn Caddy admin endpoint is already running; refusing to replace its configuration.");
      }
    } else {
      if (!await matchesProcessIdentity(owner.pid, owner.birthSignature)) {
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The recorded DevFn Caddy owner no longer matches its process identity; remove the stale owner record after verification.");
      }
    }
    if (owner) {
      try { await execFileAsync("caddy", ["reload", "--config", candidate, "--adapter", "caddyfile"], { timeout: 10_000 }); }
      catch (error) { await rm(candidate, { force: true }); throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to reload the DevFn-owned Caddy proxy.", { cause: error instanceof Error ? error.message : String(error) }); }
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
      while (Date.now() < deadline) {
        if (await Promise.race([spawnFailure, new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))])) break;
        if (!child.pid || !birthSignature || !await matchesProcessIdentity(child.pid, birthSignature)) break;
        ready = await fetch("http://127.0.0.1:2019/config/", { signal: AbortSignal.timeout(500) }).then(() => true).catch(() => false);
        if (ready) break;
      }
      if (!ready || !child.pid || !birthSignature) {
        try {
          if (child.pid && birthSignature && await matchesProcessIdentity(child.pid, birthSignature)) process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
        } catch { /* already exited */ }
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to start the DevFn-owned Caddy proxy.");
      }
      try { await writeFile(this.ownerPath, `${JSON.stringify({ pid: child.pid, birthSignature, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 }); }
      catch (error) {
        try { if (await matchesProcessIdentity(child.pid, birthSignature)) process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); } catch { /* already exited */ }
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to persist the DevFn Caddy owner record.", { cause: error instanceof Error ? error.message : String(error) });
      }
      child.unref();
    }
    await rename(candidate, this.configPath);
    const tempState = `${this.statePath}.${process.pid}.tmp`;
    await writeFile(tempState, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempState, this.statePath);
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
    });
  }

  public async removeInstance(instanceId: string): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const routes = state.routes.filter((route) => route.instanceId !== instanceId);
      if (routes.length !== state.routes.length) await this.apply({ version: 1, routes });
    });
  }

  public async routes(): Promise<ProxyRoute[]> { return (await this.read()).routes; }
}
