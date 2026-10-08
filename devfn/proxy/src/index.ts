import { execFile, spawn } from "node:child_process";
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { promisify } from "node:util";

import { parsePersistedProxyRoutes, withFileLock } from "@devfn/ports";
import { matchesProcessIdentity, processBirthSignature, processExists } from "@devfn/processes";
import { domainContains, DomainError, readRegisteredDomains, verifyCertificate, verifyLocalDns } from "./domains.js";
export { DomainError, domainContains, normalizeDomain, readRegisteredDomains, registerDomain, unregisterDomain, verifyCertificate, verifyLocalDns, type RegisteredDomain } from "./domains.js";

const execFileAsync = promisify(execFile);
const PROXY_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LISTENER_PORTS = process.platform === "darwin" ? { httpPort: 8080, httpsPort: 8443 } : { httpPort: 80, httpsPort: 443 };

export function proxyListenerPorts(): { httpPort: number; httpsPort: number } { return { ...DEFAULT_LISTENER_PORTS }; }

export interface ProxyRoute {
  id: string; instanceId: string; hostname: string; targetHost: string; targetPort: number;
  tls: "off" | "internal" | "certificate"; updatedAt: string;
  path?: string; match?: "exact" | "prefix"; stripPrefix?: boolean;
  registeredDomain?: string; projectId?: string; repositoryIdentity?: string;
  certificateFile?: string; keyFile?: string;
  /** Private, immutable copy of the certificate used by an activated route. */
  certificateDigest?: string;
}
interface ProxyState { version: 1; routes: ProxyRoute[] }
interface ProxyOwner { pid: number; birthSignature?: string }

function parseProxyOwner(value: string): ProxyOwner {
  const owner = JSON.parse(value) as Partial<ProxyOwner> | null;
  if (!owner || !Number.isInteger(owner.pid) || owner.pid! <= 0 || (owner.birthSignature !== undefined && (typeof owner.birthSignature !== "string" || owner.birthSignature.length === 0))) throw new Error("Invalid proxy owner record.");
  return owner as ProxyOwner;
}

export class ProxyError extends Error {
  public constructor(public readonly code: "DEVFN_PROXY_UNAVAILABLE" | "DEVFN_PROXY_CONFIG_INVALID" | "DEVFN_PROXY_RELOAD_FAILED" | "DEVFN_PROXY_OWNERSHIP_CONFLICT", message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ProxyError";
  }
}

export function renderCaddyfile(routes: readonly ProxyRoute[], ipv6Loopback = false, ports = proxyListenerPorts()): string {
  const lines = ["{", "  admin 127.0.0.1:2019", `  http_port ${ports.httpPort}`, `  https_port ${ports.httpsPort}`, `  default_bind 127.0.0.1${ipv6Loopback ? " [::1]" : ""}`, "  skip_install_trust", "  auto_https disable_redirects", "}", ""];
  const hosts = new Map<string, ProxyRoute[]>();
  const routeKeys = new Set<string>();
  const hostOwners = new Map<string, string>();
  for (const route of routes) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(route.hostname) || route.hostname.length > 253 ||
      (!route.hostname.toLowerCase().endsWith(".localhost") && (!route.registeredDomain || !domainContains(route.registeredDomain, route.hostname)))) {
      throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy hostname ${route.hostname} must be a concrete .localhost or registered domain name.`);
    }
    if (route.targetHost !== "127.0.0.1" && route.targetHost !== "::1") throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy target ${route.targetHost} must be a literal loopback address.`);
    if (!Number.isInteger(route.targetPort) || route.targetPort < 1 || route.targetPort > 65535) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Proxy target port ${route.targetPort} must be an integer between 1 and 65535.`);
    const routePath = route.path ?? "/";
    const match = route.match ?? "prefix";
    if (!/^\/[A-Za-z0-9._~!$&'()+,;=:@/-]*$/.test(routePath) || routePath.includes("//") || routePath.split("/").some((part) => part === "." || part === "..") ||
      !["exact", "prefix"].includes(match) || (route.stripPrefix && (match !== "prefix" || routePath === "/"))) {
      throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Invalid proxy path for ${route.id}.`);
    }
    if (!["off", "internal", "certificate"].includes(route.tls) || (route.tls === "certificate" && (!route.certificateFile || !route.keyFile)) ||
      (route.certificateDigest !== undefined && (route.tls !== "certificate" || !/^[a-f0-9]{64}$/.test(route.certificateDigest)))) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Invalid TLS mode for ${route.id}.`);
    const hostname = route.hostname.toLowerCase();
    const owner = hostOwners.get(hostname);
    if (owner !== undefined && owner !== route.instanceId) throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", `Proxy hostname ${route.hostname} is already owned by another instance.`);
    hostOwners.set(hostname, route.instanceId);
    // Caddy path matchers ignore case. Prefix /api and /api/ also render
    // identical matchers, so both must have one canonical ownership key.
    const canonicalPath = (match === "prefix" ? routePath.replace(/\/$/, "") || "/" : routePath).toLowerCase();
    const key = `${hostname}\0${match}\0${canonicalPath}`;
    if (routeKeys.has(key)) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Ambiguous route for ${route.hostname}${routePath}; path is already owned.`);
    routeKeys.add(key);
    const hostRoutes = hosts.get(route.hostname.toLowerCase()) ?? [];
    if (hostRoutes.length && hostRoutes[0].tls !== route.tls) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", `Conflicting TLS modes for ${route.hostname}.`);
    hostRoutes.push(route);
    hosts.set(route.hostname.toLowerCase(), hostRoutes);
  }
  for (const [hostname, hostRoutes] of [...hosts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const tls = hostRoutes[0];
    const tlsLine = tls.tls === "internal" ? ["  tls internal"] : tls.tls === "certificate" ? [`  tls ${JSON.stringify(tls.certificateFile)} ${JSON.stringify(tls.keyFile)}`] : [];
    if (hostRoutes.length === 1 && (tls.path ?? "/") === "/" && (tls.match ?? "prefix") === "prefix") {
      const targetHost = tls.targetHost === "::1" ? "[::1]" : tls.targetHost;
      lines.push(`${tls.tls === "off" ? "http://" : ""}${hostname} {`, `  reverse_proxy ${targetHost}:${tls.targetPort}`, ...tlsLine, "}", "");
      if (tls.tls !== "off") lines.push(`http://${hostname} {`, `  redir https://{host}${ports.httpsPort === 443 ? "" : `:${ports.httpsPort}`}{uri} 308`, "}", "");
      continue;
    }
    lines.push(`${tls.tls === "off" ? "http://" : ""}${hostname} {`, ...tlsLine, "  route {");
    const ordered = [...hostRoutes].sort((a, b) => (a.match ?? "prefix") === (b.match ?? "prefix") ? (b.path ?? "/").length - (a.path ?? "/").length : (a.match ?? "prefix") === "exact" ? -1 : 1);
    ordered.forEach((route, index) => {
      const routePath = route.path ?? "/";
      const targetHost = route.targetHost === "::1" ? "[::1]" : route.targetHost;
      const matcher = routePath === "/" && (route.match ?? "prefix") === "prefix" ? "/*" : (route.match ?? "prefix") === "exact" ? routePath : `${routePath.replace(/\/$/, "")} ${routePath.replace(/\/$/, "")}/*`;
      lines.push(`    @route${index} path ${matcher}`, `    handle @route${index} {`, ...(route.stripPrefix ? [`      uri strip_prefix ${routePath.replace(/\/$/, "")}`] : []), `      reverse_proxy ${targetHost}:${route.targetPort}`, "    }");
    });
    lines.push("    handle {", "      respond 404", "    }", "  }", "}", "");
    if (tls.tls !== "off") lines.push(`http://${hostname} {`, `  redir https://{host}${ports.httpsPort === 443 ? "" : `:${ports.httpsPort}`}{uri} 308`, "}", "");
  }
  if (hosts.size) lines.push("http:// {", "  respond 404", "}", "");
  return lines.join("\n");
}

async function ipv6LoopbackAvailable(): Promise<boolean> {
  const server = net.createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "::1", resolve);
    });
    return true;
  } catch { return false; }
  finally { if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve())); }
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
  private readonly certificateDir: string;

  public constructor(private readonly stateDir: string, private readonly resolveDns: typeof lookup = lookup, private readonly dnsTimeoutMs = 5_000) {
    this.statePath = path.join(stateDir, "proxy-routes.json");
    this.pendingPath = path.join(stateDir, "proxy-routes.pending.json");
    this.configPath = path.join(stateDir, "Caddyfile");
    this.lockPath = path.join(stateDir, "proxy.lock");
    this.ownerPath = path.join(stateDir, "proxy-owner.json");
    this.certificateDir = path.join(stateDir, "certificates");
  }

  private certificatePaths(digest: string): { certificateFile: string; keyFile: string } {
    return { certificateFile: path.join(this.certificateDir, `${digest}.crt.pem`), keyFile: path.join(this.certificateDir, `${digest}.key.pem`) };
  }

  private async snapshotCertificate(route: ProxyRoute, validate: boolean): Promise<string> {
    try {
      const [certificate, key] = await Promise.all([readFile(route.certificateFile!), readFile(route.keyFile!)]);
      const digest = createHash("sha256").update(certificate).update("\0").update(key).digest("hex");
      const target = this.certificatePaths(digest);
      await mkdir(this.certificateDir, { recursive: true, mode: 0o700 });
      const directory = await lstat(this.certificateDir);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Certificate snapshot directory is not private.");
      await chmod(this.certificateDir, 0o700);
      for (const [destination, content] of [[target.certificateFile, certificate], [target.keyFile, key]] as const) {
        const temp = `${destination}.${process.pid}.${randomUUID()}.tmp`;
        try { await writeFile(temp, content, { mode: 0o600 }); await rename(temp, destination); }
        finally { await rm(temp, { force: true }); }
      }
      if (validate) await verifyCertificate(route.hostname, target.certificateFile, target.keyFile);
      return digest;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("DEVFN_DOMAIN_CERT_INVALID", `Certificate material is unavailable for ${route.hostname}.`);
    }
  }

  private async pruneCertificateSnapshots(routes: readonly ProxyRoute[]): Promise<void> {
    const directory = await lstat(this.certificateDir).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (!directory) return;
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Certificate snapshot directory is invalid.");
    const keep = new Set(routes.flatMap((route) => route.certificateDigest ? Object.values(this.certificatePaths(route.certificateDigest)) : []));
    for (const name of await readdir(this.certificateDir)) {
      if (!/^[a-f0-9]{64}\.(?:crt|key)\.pem$/.test(name)) continue;
      const file = path.join(this.certificateDir, name);
      if (!keep.has(file)) await rm(file, { force: true });
    }
  }

  public async available(): Promise<boolean> {
    try { await execFileAsync("caddy", ["version"], { timeout: 5000 }); return true; } catch { return false; }
  }

  private async readState(file: string): Promise<ProxyState | undefined> {
    try {
      const state = JSON.parse(await readFile(file, "utf8")) as ProxyState;
      parsePersistedProxyRoutes(state);
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
      const previous = await this.readState(this.statePath);
      try {
        await this.apply(pending, true, previous?.routes ?? []);
        return pending;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        // A crashed activation must not hold every other owner hostage when
        // its DNS or certificate has since become invalid. Restore the last
        // committed configuration before accepting further updates.
        const committed = previous ?? { version: 1, routes: [] };
        await this.apply(committed, true, committed.routes, true);
        return committed;
      }
    }
    const committed = await this.readState(this.statePath) ?? { version: 1, routes: [] };
    await this.pruneCertificateSnapshots(committed.routes).catch(() => undefined);
    return committed;
  }

  private async apply(next: ProxyState, recovering = false, previous: readonly ProxyRoute[] = [], rejectPending = false): Promise<void> {
    const changed = next.routes.filter((route) => {
      const saved = previous.find((item) => item.id === route.id);
      return !saved || JSON.stringify({ ...saved, updatedAt: undefined }) !== JSON.stringify({ ...route, updatedAt: undefined });
    });
    const registrations = changed.some((route) => route.registeredDomain) ? await readRegisteredDomains(this.stateDir) : [];
    await Promise.all(changed.map(async (route) => {
      if (!route.registeredDomain) return;
      const registration = registrations.find((item) => item.domain === route.registeredDomain);
      if (!registration || !domainContains(registration.domain, route.hostname) || registration.projectId !== route.projectId ||
        registration.repositoryIdentity !== route.repositoryIdentity || registration.tls !== route.tls) {
        throw new DomainError("DEVFN_DOMAIN_UNREGISTERED", `Route ${route.hostname} has no matching machine domain registration.`);
      }
      await verifyLocalDns(route.hostname, this.resolveDns, this.dnsTimeoutMs);
      if (registration.tls === "certificate") {
        if (registration.certificateFile !== route.certificateFile || registration.keyFile !== route.keyFile) throw new DomainError("DEVFN_DOMAIN_CERT_INVALID", `Certificate registration changed for ${route.hostname}.`);
        await verifyCertificate(route.hostname, route.certificateFile, route.keyFile);
      }
    }));
    if (!await this.available()) throw new ProxyError("DEVFN_PROXY_UNAVAILABLE", "Caddy is required for this profile but is unavailable.");
    for (const route of next.routes) {
      if (route.tls !== "certificate" || route.certificateDigest) continue;
      route.certificateDigest = await this.snapshotCertificate(route, changed.includes(route));
    }
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const candidate = `${this.configPath}.candidate`;
    const renderedRoutes = next.routes.map((route) => route.certificateDigest
      ? { ...route, ...this.certificatePaths(route.certificateDigest) } : route);
    await writeFile(candidate, renderCaddyfile(renderedRoutes, await ipv6LoopbackAvailable()), { encoding: "utf8", mode: 0o600 });
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
    // A rejected activation is a rollback, not a replay. Its pending journal
    // must never replace the last committed route state after Caddy recovers.
    if (rejectPending) await rm(this.pendingPath, { force: true });
    else await rename(this.pendingPath, this.statePath);
    await this.pruneCertificateSnapshots(next.routes).catch(() => undefined);
  }

  public async upsert(routes: readonly Omit<ProxyRoute, "updatedAt">[], instanceId?: string): Promise<ProxyRoute[]> {
    const selectedOwner = instanceId ?? routes[0]?.instanceId;
    if (!selectedOwner || routes.some((route) => route.instanceId !== selectedOwner)) {
      throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "One update must name routes for one instance.");
    }
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const ids = new Set(routes.map((route) => route.id));
      if (ids.size !== routes.length) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "Duplicate route IDs in one update.");
      if (routes.some((route) => state.routes.some((saved) => saved.id === route.id && saved.instanceId !== route.instanceId))) {
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "A route ID is already owned by another instance.");
      }
      const now = new Date().toISOString();
      const nextRoutes = [...state.routes.filter((route) => route.instanceId !== selectedOwner), ...routes.map(({ certificateDigest: _ignored, ...route }) => ({ ...route, updatedAt: now }))];
      renderCaddyfile(nextRoutes);
      if (routes.length === 0 && nextRoutes.length === state.routes.length) return [];
      // Every explicitly selected route is activated again. Only routes from
      // other instances are exempt from fresh DNS and certificate checks.
      await this.apply({ version: 1, routes: nextRoutes }, false, state.routes.filter((route) => route.instanceId !== selectedOwner));
      return nextRoutes.filter((route) => ids.has(route.id));
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }

  public async removeInstance(instanceId: string): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const routes = state.routes.filter((route) => route.instanceId !== instanceId);
      if (routes.length !== state.routes.length) await this.apply({ version: 1, routes }, false, state.routes);
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }

  public async routes(): Promise<ProxyRoute[]> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(this.lockPath, async () => (await this.read()).routes, { timeoutMs: PROXY_LOCK_TIMEOUT_MS });
  }
}
