import { execFile, spawn } from "node:child_process";
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { promisify } from "node:util";

import { isPortAvailable, parsePersistedProxyRoutes, parseProxyOwner, proxyOwnerStatus, scanListenerState, withFileLock, withRoutingLock, type ProxyOwner } from "@devfn/ports";
import { matchesProcessIdentity, processBirthSignature } from "@devfn/processes";
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
export { proxyOwnerStatus } from "@devfn/ports";

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

async function privilegedListenerAbsent(port: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", (error: NodeJS.ErrnoException) => { socket.destroy(); resolve(error.code === "ECONNREFUSED"); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

/** TCP listener ports a rendered configuration binds: every site uses HTTP; TLS sites also use HTTPS. */
export function proxyListenerPortsFor(routes: readonly Pick<ProxyRoute, "tls">[], ports = proxyListenerPorts()): number[] {
  if (!routes.length) return [];
  return routes.some((route) => route.tls !== "off") ? [ports.httpPort, ports.httpsPort] : [ports.httpPort];
}

async function listenerAccepts(port: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

// Caddy's admin origin check rejects fetch's browser-style request headers,
// so read its live configuration with a plain HTTP request.
async function readAdminConfig(): Promise<unknown> {
  return await new Promise<unknown>((resolve) => {
    const request = http.get({ host: "127.0.0.1", port: 2019, path: "/config/", timeout: 1000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => {
        try { resolve(response.statusCode === 200 ? JSON.parse(body) : undefined); } catch { resolve(undefined); }
      });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(undefined));
  });
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}

export class CaddyProxyController {
  private readonly statePath: string;
  private readonly pendingPath: string;
  private readonly configPath: string;
  private readonly lockPath: string;
  private readonly ownerPath: string;
  private readonly certificateDir: string;

  public constructor(private readonly stateDir: string, private readonly resolveDns: typeof lookup = lookup, private readonly dnsTimeoutMs = 5_000,
    private readonly acceptsListener: (port: number, host: string) => Promise<boolean> = listenerAccepts) {
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

  /** Read-only ownership check for an orchestrator replacement preflight. */
  public async assertRouteOwnershipAvailable(routes: readonly Omit<ProxyRoute, "updatedAt">[], instanceId: string): Promise<void> {
    if (routes.some((route) => route.instanceId !== instanceId)) throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "One preflight must name routes for one instance.");
    await withRoutingLock(this.stateDir, async () => await withFileLock(this.lockPath, async () => {
      for (const file of [this.statePath, this.pendingPath]) {
        const state = await this.readState(file);
        if (!state) continue;
        const siblings = state.routes.filter((route) => route.instanceId !== instanceId);
        if (routes.some((route) => siblings.some((saved) => saved.id === route.id))) {
          throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "A selected proxy route ID is already owned by another instance.");
        }
        renderCaddyfile([...siblings, ...routes.map((route) => ({ ...route, updatedAt: "preflight" }))]);
      }
    }));
  }

  /** Check Caddy's executable, configuration and physical listeners before a replacement is stopped. */
  public async assertActivationReady(routes: readonly Omit<ProxyRoute, "updatedAt">[], instanceId: string): Promise<void> {
    if (!routes.length) return;
    await withRoutingLock(this.stateDir, async () => await withFileLock(this.lockPath, async () => {
      if (!await this.available()) throw new ProxyError("DEVFN_PROXY_UNAVAILABLE", "Caddy is required for this profile but is unavailable.");
      const committed = await this.readState(this.statePath);
      const pending = await this.readState(this.pendingPath);
      const siblings = (pending ?? committed)?.routes.filter((route) => route.instanceId !== instanceId) ?? [];
      const candidateRoutes = [...siblings, ...routes.map((route) => ({ ...route, updatedAt: "preflight" }))];
      const config = renderCaddyfile(candidateRoutes, await ipv6LoopbackAvailable());
      let owner: ProxyOwner | null = null;
      try { owner = parseProxyOwner(await readFile(this.ownerPath, "utf8")); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "Unable to verify the DevFn Caddy owner record.");
        }
      }
      const ownerStatus = owner ? await proxyOwnerStatus(owner) : "dead";
      if (ownerStatus === "unverified") {
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The recorded DevFn Caddy identity cannot be verified for activation.");
      }
      const adminResponds = await fetch("http://127.0.0.1:2019/config/", { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false);
      if (ownerStatus === "active" ? !adminResponds : adminResponds || !await isPortAvailable(2019, "tcp", "127.0.0.1")) {
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The Caddy admin listener is missing or owned by another process.");
      }
      const scan = await scanListenerState(false);
      const adminListeners = scan.listeners.filter((listener) => listener.protocol === "tcp" && listener.port === 2019);
      let ownerVerified = false;
      if (ownerStatus === "active") {
        if (adminListeners.some((listener) => listener.pid !== owner?.pid)) {
          throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The Caddy admin listener is not owned by the recorded process.");
        }
        // A non-dumpable owner (for example a setcap Caddy on Linux) hides its
        // sockets from same-user inspection. Its live admin configuration must
        // then be exactly the configuration DevFn committed.
        ownerVerified = (scan.inspection.tcp && adminListeners.some((listener) => listener.pid === owner?.pid)) || await this.ownerConfigMatches();
        if (!ownerVerified) throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The Caddy admin listener is not owned by the recorded process.");
      }
      // The verified owner bound every listener of its committed configuration
      // when it started or reloaded; it still holds them while it runs.
      const ownedPorts = ownerVerified ? proxyListenerPortsFor(committed?.routes ?? []) : [];
      const ipv6 = await ipv6LoopbackAvailable();
      for (const port of Object.values(proxyListenerPorts())) {
        const listeners = scan.listeners.filter((listener) => listener.protocol === "tcp" && listener.port === port);
        if (listeners.some((listener) => ownerStatus !== "active" || listener.pid !== owner?.pid)) {
          throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", `Caddy listener port ${port} is occupied by another process.`);
        }
        // A successful bind proves absence for ordinary ports even when OS
        // inspection is unavailable. Privileged ports need inspected OS state.
        for (const host of ipv6 ? ["127.0.0.1", "::1"] : ["127.0.0.1"]) {
          const recordedHost = host === "::1" ? "[::1]" : host;
          if (listeners.some((listener) => listener.pid === owner?.pid &&
            [recordedHost, host, "*", "[::]", "::"].includes(listener.host))) continue;
          if (ownedPorts.includes(port) && await this.acceptsListener(port, host)) continue;
          if (!await isPortAvailable(port, "tcp", host) &&
            (port >= 1024 || !scan.inspection.tcp || !await privilegedListenerAbsent(port, host))) {
            throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", `Caddy listener port ${port} is unavailable on ${host}.`);
          }
        }
      }
      const candidate = `${this.configPath}.preflight.${process.pid}.${randomUUID()}`;
      try {
        await writeFile(candidate, config, { mode: 0o600, flag: "wx" });
        await execFileAsync("caddy", ["validate", "--config", candidate, "--adapter", "caddyfile"], { timeout: 10_000 });
      } catch (error) {
        throw new ProxyError("DEVFN_PROXY_CONFIG_INVALID", "Caddy rejected the proposed route configuration before replacement.",
          { cause: error instanceof Error ? error.message : String(error) });
      } finally { await rm(candidate, { force: true }); }
    }));
  }

  private async ownerConfigMatches(): Promise<boolean> {
    const live = await readAdminConfig();
    if (live === undefined) return false;
    try {
      const adapted: unknown = JSON.parse((await execFileAsync("caddy", ["adapt", "--config", this.configPath, "--adapter", "caddyfile"], { timeout: 10_000 })).stdout);
      return canonicalJson(live) === canonicalJson(adapted);
    } catch { return false; }
  }

  /**
   * Lock-free readiness evidence for one instance: its committed (and any
   * pending) routes equal the expected routes, and when it has routes the
   * recorded DevFn Caddy is alive and accepting on their listener ports.
   */
  public async instanceRoutesLive(instanceId: string, expected: readonly ProxyRoute[]): Promise<boolean> {
    const comparable = (routes: readonly ProxyRoute[]) => canonicalJson([...routes]
      .map(({ updatedAt: _updated, certificateDigest: _digest, ...route }) => route)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    try {
      const committed = await this.readState(this.statePath);
      const pending = await this.readState(this.pendingPath);
      const wanted = comparable(expected);
      for (const state of [committed ?? { version: 1 as const, routes: [] }, ...(pending ? [pending] : [])]) {
        if (comparable(state.routes.filter((route) => route.instanceId === instanceId)) !== wanted) return false;
      }
      if (!expected.length) return true;
      const owner = parseProxyOwner(await readFile(this.ownerPath, "utf8"));
      if (await proxyOwnerStatus(owner) !== "active") return false;
      const hosts = await ipv6LoopbackAvailable() ? ["127.0.0.1", "::1"] : ["127.0.0.1"];
      for (const port of proxyListenerPortsFor(committed?.routes ?? [])) {
        for (const host of hosts) if (!await this.acceptsListener(port, host)) return false;
      }
      return true;
    } catch { return false; }
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
        // A reused PID cannot own this Caddy. The admin listener is the
        // independent proof that its old Caddy has also stopped.
        if (!await isPortAvailable(2019, "tcp", "127.0.0.1")) {
          await rm(candidate, { force: true });
          throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The recorded DevFn Caddy PID belongs to a different live process and the Caddy admin listener is occupied.");
        }
        await rm(this.ownerPath, { force: true });
        owner = null;
      } else if (status === "unverified") {
        await rm(candidate, { force: true });
        throw new ProxyError("DEVFN_PROXY_OWNERSHIP_CONFLICT", "The recorded DevFn Caddy process identity cannot be verified.");
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
      // Caddy's admin endpoint answers before its sites bind their listeners.
      // `--pingback` echoes our nonce only after the whole configuration,
      // including every HTTP/HTTPS listener, started successfully.
      const nonce = randomBytes(32);
      const pingback = net.createServer();
      const pingbackSockets = new Set<net.Socket>();
      const confirmed = new Promise<boolean>((resolve) => {
        pingback.on("connection", (socket) => {
          pingbackSockets.add(socket);
          const chunks: Buffer[] = [];
          socket.on("data", (chunk: Buffer) => { chunks.push(chunk); });
          socket.once("error", () => undefined);
          socket.once("end", () => { if (Buffer.concat(chunks).equals(nonce)) resolve(true); });
        });
      });
      try { await new Promise<void>((resolve, reject) => { pingback.once("error", reject); pingback.listen(0, "127.0.0.1", resolve); }); }
      catch (error) {
        await rm(candidate, { force: true });
        if (!recovering) await rm(this.pendingPath, { force: true });
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", "Unable to prepare DevFn Caddy startup confirmation.", { cause: error instanceof Error ? error.message : String(error) });
      }
      const pingbackAddress = pingback.address();
      const child = spawn("caddy", ["run", "--config", candidate, "--adapter", "caddyfile", "--pingback", `127.0.0.1:${typeof pingbackAddress === "object" && pingbackAddress ? pingbackAddress.port : 0}`],
        { detached: process.platform !== "win32", stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      child.stdin?.once("error", () => undefined);
      child.stdin?.end(nonce);
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
      let started = false;
      void confirmed.then(() => { started = true; });
      while (Date.now() < deadline) {
        if (await Promise.race([spawnFailure, confirmed.then(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))])) break;
        if (!child.pid || !birthSignature || !await matchesProcessIdentity(child.pid, birthSignature)) break;
        if (!started) continue;
        ready = await readAdminConfig() !== undefined;
        for (const port of ready ? proxyListenerPortsFor(next.routes) : []) {
          for (const host of await ipv6LoopbackAvailable() ? ["127.0.0.1", "::1"] : ["127.0.0.1"]) ready &&= await this.acceptsListener(port, host);
        }
        // A listener check after confirmation also proves Caddy survived it.
        if (ready && !await matchesProcessIdentity(child.pid, birthSignature)) ready = false;
        break;
      }
      for (const socket of pingbackSockets) socket.destroy();
      await new Promise<void>((resolve) => pingback.close(() => resolve()));
      if (!ready || !child.pid || !birthSignature) {
        await stopSpawnedChild();
        await rm(this.ownerPath, { force: true });
        await rm(candidate, { force: true });
        if (!recovering) await rm(this.pendingPath, { force: true });
        const privileged = proxyListenerPortsFor(next.routes).filter((port) => port < 1024);
        throw new ProxyError("DEVFN_PROXY_RELOAD_FAILED", `Unable to start the DevFn-owned Caddy proxy and confirm its listeners.${process.platform === "linux" && privileged.length
          ? ` Binding ports ${privileged.join(" and ")} needs net.ipv4.ip_unprivileged_port_start at or below ${Math.min(...privileged)} or cap_net_bind_service on the Caddy binary; DevFn changes neither.` : ""}`);
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
    return await withRoutingLock(this.stateDir, async () => await withFileLock(this.lockPath, async () => {
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
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS }));
  }

  public async removeInstance(instanceId: string): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await withRoutingLock(this.stateDir, async () => await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const routes = state.routes.filter((route) => route.instanceId !== instanceId);
      if (routes.length !== state.routes.length) await this.apply({ version: 1, routes }, false, state.routes);
    }, { timeoutMs: PROXY_LOCK_TIMEOUT_MS }));
  }

  public async routes(): Promise<ProxyRoute[]> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    return await withRoutingLock(this.stateDir, async () => await withFileLock(this.lockPath, async () => (await this.read()).routes, { timeoutMs: PROXY_LOCK_TIMEOUT_MS }));
  }
}
