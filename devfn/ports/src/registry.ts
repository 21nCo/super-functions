import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { processExists, processGroupStatus } from "@devfn/processes";

import { allocateEphemeralPort, bindProbe, connectionRefused, isPortAvailable, scanListenerState } from "./listeners.js";
import { withFileLock, withRoutingLock } from "./lock.js";
import { PortRegistryError, type ComposeLaunchRecord, type LifecycleOwner, type PortAllocation, type RegistryInvocation, type RegistryState, type ReservationInput, type ReservationRequest } from "./types.js";
import { parsePersistedProxyRoutes, type PersistedProxyRoute } from "./proxy-state.js";
import { parseProxyOwner, proxyOwnerStatus } from "./proxy-owner.js";

const EMPTY: RegistryState = { version: 1, revision: 0, allocations: [], invocations: [] };
const execFileAsync = promisify(execFile);
const ABANDONED_CLAIM_MS = 300_000;

function proxyListenerMigration(port: number): string {
  return `Stop the profile using port ${port}, change its exact/preferred service port, then retry proxy activation; DevFn does not move existing leases.`;
}

// Route files are owned by the proxy. A missing file proves no routes there;
// an unreadable or malformed file proves nothing about its routes.
async function readPersistedRoutes(stateDir: string): Promise<PersistedProxyRoute[]> {
  const routes: PersistedProxyRoute[] = [];
  for (const name of ["proxy-routes.json", "proxy-routes.pending.json"]) {
    let state: unknown;
    try { state = JSON.parse(await readFile(path.join(stateDir, name), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    routes.push(...parsePersistedProxyRoutes(state));
  }
  return routes;
}

async function noOwnedProxyRoutes(stateDir: string, instanceId: string): Promise<boolean> {
  try { return !(await readPersistedRoutes(stateDir)).some((route) => route.instanceId === instanceId); }
  catch { return false; }
}

// A committed or pending route keeps sending traffic to its target port until
// a route transition replaces or removes it, even after the target's lease
// ended (for example after an interrupted replacement).
async function routedTargetPorts(stateDir: string, exceptInstanceId: string): Promise<Map<number, string>> {
  let routes: PersistedProxyRoute[];
  try { routes = await readPersistedRoutes(stateDir); }
  catch (error) {
    throw new PortRegistryError("DEVFN_REGISTRY_INVALID", "Proxy route state is unreadable, so the ports its routes target cannot be protected.",
      { cause: error instanceof Error ? error.message : String(error) });
  }
  return new Map(routes.filter((route) => route.instanceId !== exceptInstanceId).map((route) => [route.targetPort, route.instanceId]));
}

function routedPortAction(instanceId: string): string {
  return `Stop or restart instance ${instanceId} so its proxy routes no longer target this port (run devfn ports gc if no lifecycle of that instance remains), or change this service's port.`;
}

// Caddy's admin origin check rejects fetch's browser-style request headers.
async function readCaddyConfig(): Promise<{ config: unknown } | undefined> {
  return await new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port: 2019, path: "/config/", timeout: 1000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => {
        try { resolve(response.statusCode === 200 ? { config: JSON.parse(body) } : undefined); } catch { resolve(undefined); }
      });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(undefined));
  });
}

/** Ports named by a Caddy configuration's HTTP server listeners, or undefined when they cannot be determined. */
function configuredListenerPorts(config: unknown): Set<number> | undefined {
  const ports = new Set<number>();
  if (config === null) return ports;
  if (typeof config !== "object") return undefined;
  const apps = (config as { apps?: unknown }).apps;
  if (apps === undefined) return ports;
  if (!apps || typeof apps !== "object") return undefined;
  const servers = (apps as { http?: { servers?: unknown } }).http?.servers;
  if (servers === undefined || servers === null) return ports;
  if (typeof servers !== "object") return undefined;
  for (const server of Object.values(servers)) {
    const listen = (server as { listen?: unknown } | null)?.listen;
    if (!Array.isArray(listen)) return undefined;
    for (const address of listen) {
      const match = typeof address === "string" ? /:(\d+)(?:-(\d+))?$/.exec(address) : null;
      if (!match) return undefined;
      const first = Number(match[1]);
      const last = Number(match[2] ?? match[1]);
      if (last < first || last - first > 65535) return undefined;
      for (let port = first; port <= last; port += 1) ports.add(port);
    }
  }
  return ports;
}

async function proxyClaimHasNoBoundListener(stateDir: string, ports: readonly number[]): Promise<boolean> {
  if (!ports.length || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) return false;
  const scanned = await scanListenerState(false);
  if (scanned.listeners.some((listener) => ports.includes(listener.port))) return false;
  // Successful socket inspection can still miss a listener whose owner is
  // non-dumpable (a setcap Caddy on Linux), so absence needs direct proof on
  // every loopback family Caddy binds. A refused connection proves it for
  // TCP; UDP (Caddy's HTTP/3) and ordinary TCP ports must also bind. A
  // privileged bind that is denied proves nothing, so that port then needs a
  // verified owner whose live configuration excludes it.
  const hosts = await isPortAvailable(0, "tcp", "::1") ? ["127.0.0.1", "::1"] : ["127.0.0.1"];
  let unproven = false;
  // A refused connection alone is not proof: a firewall rule can refuse
  // connections to a listening port. Every port must also bind; a denied
  // privileged bind leaves the claim unproven.
  for (const port of ports) {
    for (const host of hosts) if (!await connectionRefused(port, host)) return false;
    for (const host of hosts) {
      for (const protocol of ["tcp", "udp"] as const) {
        const bound = await bindProbe(port, protocol, host);
        if (bound === "occupied" || bound === "unavailable") return false;
        if (bound === "denied") unproven = true;
      }
    }
  }
  let owner;
  try { owner = parseProxyOwner(await readFile(path.join(stateDir, "proxy-owner.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  const status = owner ? await proxyOwnerStatus(owner) : "dead";
  if (status === "unverified") return false;
  // A verified Caddy may keep its admin listener after all sites are gone; its
  // own configuration must then show no listener on the claimed ports.
  if (status === "active") {
    const live = await readCaddyConfig();
    const configured = live && configuredListenerPorts(live.config);
    return configured !== undefined && !ports.some((port) => configured.has(port));
  }
  if (unproven) return false;
  // For an absent/dead/reused owner, an occupied admin port is ambiguous.
  return await isPortAvailable(2019, "tcp", "127.0.0.1");
}

/**
 * The one conclusive-evidence rule for retiring a proxy listener claim, shared
 * by abandoned-claim expiry and interrupted or failed lifecycle recovery:
 * neither committed nor pending proxy state routes the instance, and no
 * listener remains on a claimed port. Proxy mutations hold proxy.lock across
 * their route journal and reload, so both are inspected under it.
 */
async function proxyClaimRetirable(stateDir: string, instanceId: string, ports: readonly number[]): Promise<boolean> {
  try {
    return await withFileLock(path.join(stateDir, "proxy.lock"), async () =>
      await noOwnedProxyRoutes(stateDir, instanceId) && await proxyClaimHasNoBoundListener(stateDir, ports));
  } catch { return false; }
}

const CLAIM_STATES: ReadonlySet<RegistryInvocation["state"]> = new Set(["planning", "starting", "ready", "stopping"]);

function holdsProxyClaim(invocation: RegistryInvocation): boolean {
  return Boolean(invocation.proxyListenerPorts?.length) && (CLAIM_STATES.has(invocation.state) || invocation.proxyClaimRetained === true);
}

async function refreshAllocation(allocation: PortAllocation, now: string, available: (port: number, protocol: "tcp" | "udp", host: string) => Promise<boolean>): Promise<void> {
  const previousState = allocation.state;
  const portAvailable = await available(allocation.port, allocation.protocol, allocation.host);
  // Age ends a planned lease only on a free port: an occupied one may be held
  // by a node an interrupted start launched before its lease became active.
  if (allocation.state === "planned" && Date.now() - Date.parse(allocation.updatedAt) > ABANDONED_CLAIM_MS) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "active" && allocation.process && !await processOwnerMayRun(allocation.process)) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "active" && allocation.container && await inspectContainerRunning(allocation.container) === false) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "active" && !allocation.process && !allocation.container) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "externally-occupied" && portAvailable) allocation.state = "stale";
  if (allocation.state !== previousState) allocation.updatedAt = now;
}

async function expireAbandonedProxyClaims(state: RegistryState, stateDir: string, now: string,
  available: (port: number, protocol: "tcp" | "udp", host: string) => Promise<boolean>): Promise<void> {
  const verdicts = new Map<string, Promise<boolean>>();
  const retirable = async (invocation: RegistryInvocation) => {
    const key = JSON.stringify([invocation.instanceId, [...invocation.proxyListenerPorts!].sort((a, b) => a - b)]);
    if (!verdicts.has(key)) verdicts.set(key, proxyClaimRetirable(stateDir, invocation.instanceId, invocation.proxyListenerPorts!));
    return await verdicts.get(key)!;
  };
  for (const invocation of state.invocations) {
    if (!holdsProxyClaim(invocation)) continue;
    // A retained claim has no running command to protect; only its evidence counts.
    if (invocation.proxyClaimRetained) {
      if (await retirable(invocation)) {
        delete invocation.proxyClaimRetained;
        invocation.updatedAt = now;
      }
      continue;
    }
    if (!Number.isFinite(Date.parse(invocation.updatedAt)) || recentlyRefreshed(invocation)) continue;
    for (const allocation of state.allocations.filter((item) => item.invocationId === invocation.id && active(item) && !retainedForReplacement(state, item.invocationId))) {
      await refreshAllocation(allocation, now, available);
    }
    if (state.allocations.some((item) => item.invocationId === invocation.id && (item.state === "planned" || item.state === "active"))) continue;
    // An occupied port proves its occupant is ours only while a recorded
    // owner of this lifecycle may still run; otherwise it is foreign.
    if (state.allocations.some((item) => item.invocationId === invocation.id && item.state === "externally-occupied") &&
      await journalMayRun(state, invocation)) continue;
    // Inconclusive ownership evidence keeps the claim.
    if (!await retirable(invocation)) continue;
    Object.assign(invocation, { state: "failed", errorCode: "DEVFN_INTERRUPTED", updatedAt: now });
  }
}

function ownerKey(owner: LifecycleOwner): string {
  return JSON.stringify([owner.node, owner.process?.pid, owner.process?.birthSignature, owner.container?.id]);
}

function addOwners(invocation: RegistryInvocation, owners: readonly LifecycleOwner[]): void {
  const known = new Set((invocation.owners ?? []).map(ownerKey));
  for (const owner of owners) {
    if (known.has(ownerKey(owner))) continue;
    known.add(ownerKey(owner));
    invocation.owners ??= [];
    invocation.owners.push(owner);
  }
}

/**
 * An earlier release recorded a lease's process owner without a record time.
 * Activation wrote updatedAt just after reading that owner's signature, and
 * an active lease keeps it until its state changes, so while the lease is
 * active updatedAt is that record time. It is copied onto the owner before
 * any transition can change updatedAt; a lease that left active under an
 * earlier release has no such time.
 */
function recordLeaseOwnerTimes(state: RegistryState): void {
  for (const allocation of state.allocations) {
    if (allocation.state === "active" && allocation.process && !allocation.process.recordedAt) allocation.process.recordedAt = allocation.updatedAt;
  }
}

function allocationOwners(allocation: PortAllocation): LifecycleOwner[] {
  return [
    ...(allocation.process ? [{ node: allocation.service, process: allocation.process }] : []),
    ...(allocation.container ? [{ node: allocation.service, container: allocation.container }] : []),
  ];
}

/**
 * Only a verified-dead identity is death evidence; a live or unverifiable one
 * may still run. A recorded process leads its own group, so its exit proves
 * nothing while processes it started remain in that group.
 */
async function processOwnerMayRun(owner: NonNullable<PortAllocation["process"]>): Promise<boolean> {
  const status = await processGroupStatus(owner.pid, owner.birthSignature, owner.recordedAt);
  return status === "running" || status === "unverified";
}

/** An owner may name a process, a container or both; each must be verified dead. */
async function ownerMayRun(owner: LifecycleOwner): Promise<boolean> {
  if (!owner.process && !owner.container) return true;
  if (owner.process && await processOwnerMayRun(owner.process)) return true;
  return owner.container ? await inspectContainerRunning(owner.container) !== false : false;
}

/**
 * Whether anything an invocation launched may still run, judged only from its
 * owner journal: a launch whose identity was never recorded, or a recorded
 * process or container identity not verified dead. A stopped invocation ended
 * only after teardown verified every receipt and journal owner dead or
 * stopped it by identity, and resolved every launch. Failing or interrupting one
 * does not stop owners its receipt never listed, so failed invocations count
 * too. A running lifecycle with neither an owner journal nor a recorded owner
 * predates the journal and proves nothing.
 */
async function journalMayRun(state: RegistryState, invocation: RegistryInvocation): Promise<boolean> {
  if (invocation.state === "stopped") return false;
  if (invocation.launching?.length) return true;
  const owners = [...(invocation.owners ?? []), ...state.allocations.filter((item) => item.invocationId === invocation.id).flatMap(allocationOwners)];
  if (!owners.length && !invocation.ownerJournal) return CLAIM_STATES.has(invocation.state);
  for (const owner of owners) if (await ownerMayRun(owner)) return true;
  return false;
}

function stableOffset(value: string, size: number): number {
  if (size <= 1) return 0;
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16) % size;
}

function candidates(start: number, end: number, seed: string): number[] {
  if (end < start) return [];
  const values = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const offset = stableOffset(seed, values.length);
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function active(allocation: PortAllocation): boolean {
  return allocation.state === "planned" || allocation.state === "active" || allocation.state === "externally-occupied";
}

// Lifecycle commands refresh their invocation while they run. Protection
// that depends on a running command expires when that refresh stops.
function recentlyRefreshed(invocation: RegistryInvocation): boolean {
  return Date.now() - Date.parse(invocation.updatedAt) <= ABANDONED_CLAIM_MS;
}

function retainedForReplacement(state: RegistryState, invocationId: string): boolean {
  return state.invocations.some((item) => item.replacingInvocationId === invocationId &&
    (item.state === "planning" || item.state === "starting") && recentlyRefreshed(item));
}

function stoppingInProgress(state: RegistryState, invocationId: string): boolean {
  return state.invocations.some((item) => item.id === invocationId && item.state === "stopping" && recentlyRefreshed(item));
}

function occupancyKey(port: number, protocol: "tcp" | "udp" = "tcp"): string {
  return `${protocol}:${port}`;
}

export class FilePortRegistry {
  public readonly filePath: string;
  private readonly lockPath: string;

  public constructor(
    filePath: string,
    private readonly ephemeralAllocator = allocateEphemeralPort,
    private readonly availabilityCheck = isPortAvailable,
  ) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
  }

  public async read(): Promise<RegistryState> {
    try {
      const state = JSON.parse(await readFile(this.filePath, "utf8")) as RegistryState;
      if (state.version !== 1 || !Array.isArray(state.allocations) || !Array.isArray(state.invocations)) throw new Error("Unsupported registry schema");
      recordLeaseOwnerTimes(state);
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
      throw new PortRegistryError("DEVFN_REGISTRY_INVALID", `Unable to read registry ${this.filePath}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async write(state: RegistryState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }

  public async transaction<T>(action: (state: RegistryState) => Promise<T> | T): Promise<T> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    return await withRoutingLock(path.dirname(this.filePath), async () => await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const result = await action(state);
      state.revision += 1;
      await this.write(state);
      return result;
    }));
  }

  public async reserve(input: ReservationInput): Promise<PortAllocation[]> {
    return await this.transaction(async (state) => {
      const now = new Date().toISOString();
      await expireAbandonedProxyClaims(state, path.dirname(this.filePath), now, this.availabilityCheck);
      if (input.replacingInvocationId && !state.invocations.some((item) => item.id === input.replacingInvocationId && item.projectId === input.projectId && item.instanceId === input.instanceId && item.state === "ready")) {
        throw new PortRegistryError("DEVFN_REGISTRY_INVALID", "A replacement may only reuse its own ready invocation's leases.");
      }
      const priorLease = (port: number, protocol: "tcp" | "udp", host: string) => state.allocations.some((item) =>
        item.invocationId === input.replacingInvocationId && item.state === "active" && item.port === port && item.protocol === protocol && item.host === host);
      const availableForReplacement = async (port: number, protocol: "tcp" | "udp", host: string) =>
        priorLease(port, protocol, host) || await this.availabilityCheck(port, protocol, host);
      const proxyPorts = new Set(input.proxyListenerPorts ?? []);
      for (const port of proxyPorts) {
        const conflict = state.allocations.find((item) => active(item) && item.invocationId !== input.replacingInvocationId && item.port === port);
        if (conflict) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Proxy listener port ${port} is leased by ${conflict.instanceId}/${conflict.service}. ${proxyListenerMigration(port)}`,
          { port, instanceId: conflict.instanceId, service: conflict.service, action: proxyListenerMigration(port) });
      }
      const occupied = new Set(state.allocations.filter((item) => active(item) && item.invocationId !== input.replacingInvocationId).map((item) => occupancyKey(item.port, item.protocol)));
      const claimingInstance = new Map<number, { instanceId: string; inherited: boolean }>();
      for (const invocation of state.invocations) {
        if (invocation.id !== input.replacingInvocationId && holdsProxyClaim(invocation)) {
          for (const port of invocation.proxyListenerPorts ?? []) {
            proxyPorts.add(port);
            claimingInstance.set(port, { instanceId: invocation.instanceId, inherited: true });
          }
        }
      }
      for (const port of input.proxyListenerPorts ?? []) claimingInstance.set(port, { instanceId: input.instanceId, inherited: false });
      for (const value of [...(input.protectedPorts ?? []), ...(input.excludedPorts ?? []), ...proxyPorts]) {
        occupied.add(occupancyKey(value, "tcp"));
        occupied.add(occupancyKey(value, "udp"));
      }
      // Every routed port belongs to another instance's route, so even a
      // lease this instance already holds on it cannot be renewed.
      const routedBy = await routedTargetPorts(path.dirname(this.filePath), input.instanceId);
      for (const port of routedBy.keys()) occupied.add(occupancyKey(port, "tcp"));
      const stable = new Map(
        state.allocations
          .filter((item) => item.projectId === input.projectId && item.instanceId === input.instanceId && item.state !== "externally-occupied")
          .map((item) => [item.service, item]),
      );
      const planned: PortAllocation[] = [];

      const choose = async (name: string, spec: ReservationInput["requests"][number]["spec"]): Promise<{ port: number; source: PortAllocation["source"] }> => {
        const host = spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1";
        const protocol = spec.protocol ?? "tcp";
        if (spec.ephemeral) {
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const port = await this.ephemeralAllocator(host, spec.protocol);
            if (!occupied.has(occupancyKey(port, protocol))) return { port, source: "ephemeral" };
          }
          throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Unable to allocate an unleased ephemeral port for ${name}.`, { service: name });
        }
        if (spec.exact && spec.preferred !== undefined) {
          if (occupied.has(occupancyKey(spec.preferred, protocol)) || !await availableForReplacement(spec.preferred, protocol, host)) {
            const claim = claimingInstance.get(spec.preferred);
            if (claim) {
              const claimant = claim.instanceId;
              const action = claimant !== input.instanceId
                ? `Change this service's exact port or stop proxy instance ${claimant} before retrying.`
                : claim.inherited
                  ? "An interrupted or failed lifecycle of this instance still holds proxy routes or listener evidence; run devfn down, then retry."
                  : "This profile also selects proxy routes; change the service's exact port before activating them.";
              throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${spec.preferred} for ${name} is claimed by proxy instance ${claimant}. ${action}`,
                { service: name, port: spec.preferred, instanceId: claimant, action });
            }
            const router = protocol === "tcp" ? routedBy.get(spec.preferred) : undefined;
            if (router) {
              throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${spec.preferred} for ${name} is still targeted by proxy routes of instance ${router}. ${routedPortAction(router)}`,
                { service: name, port: spec.preferred, instanceId: router, action: routedPortAction(router) });
            }
            throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${spec.preferred} for ${name} is occupied.`, { service: name, port: spec.preferred });
          }
          return { port: spec.preferred, source: "exact" };
        }
        const prior = stable.get(name);
        if (prior?.protocol === protocol && !occupied.has(occupancyKey(prior.port, protocol)) && await availableForReplacement(prior.port, protocol, host)) return { port: prior.port, source: "stable" };
        const pools: Array<{ values: number[]; source: PortAllocation["source"] }> = [];
        if (spec.preferred !== undefined) pools.push({ values: [spec.preferred], source: "preferred" });
        if (spec.range) pools.push({ values: candidates(spec.range[0], spec.range[1], `${input.instanceId}:${name}`), source: "range" });
        if (input.preferredRange) pools.push({ values: candidates(input.preferredRange[0], input.preferredRange[1], `${input.instanceId}:${name}:policy`), source: "preferred" });
        const fallback = input.fallbackRange ?? [4100, 4999];
        pools.push({ values: candidates(fallback[0], fallback[1], `${input.instanceId}:${name}:fallback`), source: "fallback" });
        for (const pool of pools) {
          for (const port of pool.values) {
            if (occupied.has(occupancyKey(port, protocol))) continue;
            if (await availableForReplacement(port, protocol, host)) return { port, source: pool.source };
          }
        }
        throw new PortRegistryError("DEVFN_PORT_CONFLICT", `No available port for ${name}.`, { service: name });
      };

      const blockGroups = new Map<string, typeof input.requests>();
      for (const request of input.requests) {
        if (!request.spec.block) continue;
        const group = blockGroups.get(request.spec.block) ?? [];
        group.push(request);
        blockGroups.set(request.spec.block, group);
      }
      const handled = new Set<string>();
      for (const [block, group] of blockGroups) {
        const exactGroup = group.filter((request) => request.spec.exact);
        if (exactGroup.length > 0 && exactGroup.length !== group.length) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Port block ${block} cannot mix exact and reallocatable requirements.`);
        const configured = group.map((request) => request.spec.range).filter(Boolean) as [number, number][];
        const ranges = [
          ...configured.map((value) => ({ value, source: "range" as const })),
          ...(input.preferredRange ? [{ value: input.preferredRange, source: "preferred" as const }] : []),
          { value: input.fallbackRange ?? [4100, 4999] as [number, number], source: "fallback" as const },
        ].filter((item, index, all) => all.findIndex((candidate) => candidate.value[0] === item.value[0] && candidate.value[1] === item.value[1]) === index);
        let chosen: number[] | null = null;
        let blockSource: PortAllocation["source"] = "range";
        if (exactGroup.length) {
          const exactPorts = group.map((request) => request.spec.preferred!);
          const sorted = [...new Set(exactPorts)].sort((a, b) => a - b);
          if (sorted.length !== group.length || sorted.at(-1)! - sorted[0] + 1 !== group.length) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port block ${block} is not contiguous.`);
          if (!exactPorts.some((port, index) => occupied.has(occupancyKey(port, group[index].spec.protocol ?? "tcp"))) && (await Promise.all(exactPorts.map((port, index) => availableForReplacement(port, group[index].spec.protocol ?? "tcp", group[index].spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1")))).every(Boolean)) chosen = exactPorts;
          blockSource = "exact";
        } else {
          const preferredPorts = group.map((request) => request.spec.preferred);
          if (preferredPorts.every((port): port is number => port !== undefined)) {
            const unique = [...new Set(preferredPorts)].sort((a, b) => a - b);
            const contiguous = unique.length === group.length && unique.at(-1)! - unique[0] + 1 === group.length;
            if (contiguous && !preferredPorts.some((port, index) => occupied.has(occupancyKey(port, group[index].spec.protocol ?? "tcp"))) && (await Promise.all(preferredPorts.map((port, index) => availableForReplacement(port, group[index].spec.protocol ?? "tcp", group[index].spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1")))).every(Boolean)) {
              chosen = preferredPorts;
              blockSource = "preferred";
            }
          }
          for (let rangeIndex = 0; rangeIndex < ranges.length && !chosen; rangeIndex += 1) {
            const { value: range, source } = ranges[rangeIndex];
            for (const start of candidates(range[0], range[1] - group.length + 1, `${input.instanceId}:${block}:${rangeIndex}`)) {
              const ports = group.map((_, index) => start + index);
              if (ports.some((port, index) => group[index].spec.range && (port < group[index].spec.range![0] || port > group[index].spec.range![1]))) continue;
              if (ports.some((port, index) => occupied.has(occupancyKey(port, group[index].spec.protocol ?? "tcp")))) continue;
              if ((await Promise.all(ports.map((port, index) => availableForReplacement(port, group[index].spec.protocol ?? "tcp", group[index].spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1")))).every(Boolean)) {
                chosen = ports;
                blockSource = source;
                break;
              }
            }
          }
        }
        if (!chosen) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `No contiguous port block available for ${block}.`);
        group.forEach((request, index) => {
          const port = chosen![index];
          occupied.add(occupancyKey(port, request.spec.protocol ?? "tcp"));
          planned.push({
            id: randomUUID(), projectId: input.projectId, instanceId: input.instanceId, service: request.name,
            protocol: request.spec.protocol ?? "tcp", host: request.spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1", port,
            ...(request.spec.internal ? { internalPort: request.spec.internal } : {}), ...(request.hostname ? { hostname: request.hostname } : {}),
            invocationId: input.invocationId, state: "planned", source: blockSource, createdAt: now, updatedAt: now,
          });
          handled.add(request.name);
        });
      }

      for (const request of input.requests) {
        if (handled.has(request.name)) continue;
        const selection = await choose(request.name, request.spec);
        occupied.add(occupancyKey(selection.port, request.spec.protocol ?? "tcp"));
        planned.push({
          id: randomUUID(), projectId: input.projectId, instanceId: input.instanceId, service: request.name,
          protocol: request.spec.protocol ?? "tcp", host: request.spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1", port: selection.port,
          ...(request.spec.internal ? { internalPort: request.spec.internal } : {}), ...(request.hostname ? { hostname: request.hostname } : {}),
          invocationId: input.invocationId, state: "planned", source: selection.source, createdAt: now, updatedAt: now,
        });
      }
      state.allocations.push(...planned);
      state.invocations.push({ id: input.invocationId, projectId: input.projectId, instanceId: input.instanceId, profile: input.profile, state: "planning", createdAt: now, updatedAt: now,
        ownerJournal: true,
        ...(input.replacingInvocationId ? { replacingInvocationId: input.replacingInvocationId } : {}),
        ...(input.proxyListenerPorts?.length ? { proxyListenerPorts: [...input.proxyListenerPorts] } : {}) });
      return planned;
    });
  }

  public async assertProxyListenerAvailable(ports: readonly number[], exceptInstanceId: string, requests: readonly ReservationRequest[] = []): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await withRoutingLock(path.dirname(this.filePath), async () => await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      const selfConflict = requests.find((request) => request.spec.exact && request.spec.preferred !== undefined && ports.includes(request.spec.preferred));
      if (selfConflict) {
        const port = selfConflict.spec.preferred!;
        throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${selfConflict.name} is claimed by proxy instance ${exceptInstanceId}. This profile also selects proxy routes; change the service's exact port before activating them.`,
          { service: selfConflict.name, port, instanceId: exceptInstanceId, action: "Change this service's exact port before activating proxy routes." });
      }
      const conflict = state.allocations.find((item) => active(item) && item.instanceId !== exceptInstanceId && ports.includes(item.port));
      if (conflict) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Proxy listener port ${conflict.port} is leased by ${conflict.instanceId}/${conflict.service}. ${proxyListenerMigration(conflict.port)}`,
        { port: conflict.port, instanceId: conflict.instanceId, service: conflict.service, action: proxyListenerMigration(conflict.port) });
    }));
  }

  /** Validate a replacement before its old service and leases are removed. */
  public async assertReplacementAvailable(ports: readonly number[], exceptInstanceId: string,
    requests: readonly ReservationRequest[], checkRoutes: () => Promise<void>, replacingInvocationId?: string): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await withRoutingLock(path.dirname(this.filePath), async () => await withFileLock(this.lockPath, async () => {
      const state = await this.read();
      // Reserve performs this recovery too. Preflight must observe the same
      // persisted claim state before it can deny a replacement or first start.
      const before = JSON.stringify(state);
      await expireAbandonedProxyClaims(state, path.dirname(this.filePath), new Date().toISOString(), this.availabilityCheck);
      if (JSON.stringify(state) !== before) {
        state.revision += 1;
        await this.write(state);
      }
      // A stale receipt may name an invocation already removed from the
      // registry. Only a matching ready registry invocation can own a port
      // for this preflight; prepareExisting will recover the stale receipt.
      const readyReplacement = replacingInvocationId && state.invocations.some((item) => item.id === replacingInvocationId &&
        item.instanceId === exceptInstanceId && item.state === "ready");
      const routedBy = await routedTargetPorts(path.dirname(this.filePath), exceptInstanceId);
      for (const request of requests) {
        const port = request.spec.exact ? request.spec.preferred : undefined;
        if (port === undefined) continue;
        if (ports.includes(port)) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is claimed by this profile's proxy; change the service's exact port before activating proxy routes.`,
          { port, service: request.name, instanceId: exceptInstanceId });
        const lease = state.allocations.find((item) => active(item) && item.instanceId !== exceptInstanceId && item.port === port && item.protocol === (request.spec.protocol ?? "tcp"));
        if (lease) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is leased by ${lease.instanceId}/${lease.service}.`,
          { port, service: request.name, instanceId: lease.instanceId });
        const claimant = state.invocations.find((item) => item.instanceId !== exceptInstanceId && holdsProxyClaim(item) && item.proxyListenerPorts?.includes(port));
        if (claimant) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is claimed by proxy instance ${claimant.instanceId}.`,
          { port, service: request.name, instanceId: claimant.instanceId });
        const protocol = request.spec.protocol ?? "tcp";
        // reserve reuses an exact port by ready invocation, even when a
        // replacement renames the service. Keep preflight's ownership rule
        // identical so it cannot reject a safe rename before teardown.
        const host = request.spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1";
        const owned = Boolean(readyReplacement) && state.allocations.some((item) => active(item) && item.invocationId === replacingInvocationId &&
          item.instanceId === exceptInstanceId && item.port === port && item.protocol === protocol && item.host === host);
        const router = protocol === "tcp" ? routedBy.get(port) : undefined;
        if (router) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is still targeted by proxy routes of instance ${router}. ${routedPortAction(router)}`,
          { port, service: request.name, instanceId: router, action: routedPortAction(router) });
        if (!owned && !await this.availabilityCheck(port, protocol, host)) {
          throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is occupied.`, { port, service: request.name });
        }
      }
      for (const port of ports) {
        const lease = state.allocations.find((item) => active(item) && item.instanceId !== exceptInstanceId && item.port === port);
        if (lease) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Proxy listener port ${port} is leased by ${lease.instanceId}/${lease.service}. ${proxyListenerMigration(port)}`,
          { port, instanceId: lease.instanceId, service: lease.service, action: proxyListenerMigration(port) });
      }
      // Lock order is registry, then proxy, matching claim expiry. No sibling
      // can change either persisted surface during this ownership check.
      await checkRoutes();
    }));
  }

  public async updateInvocation(id: string, update: Partial<Pick<RegistryInvocation, "state" | "errorCode">>): Promise<void> {
    await this.transaction((state) => {
      const now = new Date().toISOString();
      const invocation = state.invocations.find((item) => item.id === id);
      if (!invocation) return;
      Object.assign(invocation, update, { updatedAt: now });
      if (invocation.state === "planning" || invocation.state === "starting") {
        for (const allocation of state.allocations) if (allocation.invocationId === id && allocation.state === "planned") allocation.updatedAt = now;
      }
    });
  }

  /**
   * Journal a Compose launch before it starts, so an interruption before its
   * identity is recorded stays ambiguous and teardown can still find what it
   * created. It is journaled again with its launcher identity before the
   * launcher may run. A process command runs only after its identity is
   * recorded.
   */
  public async beginLaunch(invocationId: string, node: string, compose: ComposeLaunchRecord): Promise<void> {
    await this.transaction((state) => {
      const invocation = state.invocations.find((item) => item.id === invocationId);
      if (!invocation) throw new PortRegistryError("DEVFN_REGISTRY_INVALID", `Invocation ${invocationId} is not registered.`);
      invocation.launching ??= [];
      if (!invocation.launching.includes(node)) invocation.launching.push(node);
      invocation.composeLaunches ??= {};
      invocation.composeLaunches[node] = compose;
      invocation.updatedAt = new Date().toISOString();
    });
  }

  /** Record the identities a launched node runs as; the launch stays ambiguous until at least one is known. */
  public async recordOwners(invocationId: string, node: string, owners: ReadonlyArray<Omit<LifecycleOwner, "node">>): Promise<void> {
    await this.transaction((state) => {
      const invocation = state.invocations.find((item) => item.id === invocationId);
      if (!invocation) throw new PortRegistryError("DEVFN_REGISTRY_INVALID", `Invocation ${invocationId} is not registered.`);
      addOwners(invocation, owners.map((owner) => ({ ...owner, node })));
      if (owners.length && invocation.launching) {
        invocation.launching = invocation.launching.filter((item) => item !== node);
        if (!invocation.launching.length) delete invocation.launching;
        if (invocation.composeLaunches) delete invocation.composeLaunches[node];
        if (invocation.composeLaunches && !Object.keys(invocation.composeLaunches).length) delete invocation.composeLaunches;
      }
      invocation.updatedAt = new Date().toISOString();
    });
  }

  public async recoverInterrupted(instanceId: string): Promise<number> {
    return await this.transaction(async (state) => {
      const now = new Date().toISOString();
      const interrupted = new Set(state.invocations.filter((invocation) => invocation.instanceId === instanceId && ["planning", "starting"].includes(invocation.state)).map((invocation) => invocation.id));
      for (const allocation of state.allocations) {
        if (allocation.instanceId !== instanceId || allocation.state !== "planned") continue;
        Object.assign(allocation, { state: "released", updatedAt: now, releasedAt: now });
      }
      for (const invocation of state.invocations) {
        if (!interrupted.has(invocation.id) || !["planning", "starting"].includes(invocation.state)) continue;
        // An interrupted activation may have left routes or a listener the
        // next lifecycle has not reconciled yet; its claim stays until the
        // shared evidence proves both are gone.
        const retain = Boolean(invocation.proxyListenerPorts?.length) &&
          !await proxyClaimRetirable(path.dirname(this.filePath), instanceId, invocation.proxyListenerPorts!);
        Object.assign(invocation, { state: "failed", errorCode: "DEVFN_INTERRUPTED", updatedAt: now, ...(retain ? { proxyClaimRetained: true } : {}) });
      }
      return interrupted.size;
    });
  }

  public async markActive(invocationId: string, owners: Record<string, { process?: PortAllocation["process"]; container?: PortAllocation["container"] }> = {}): Promise<void> {
    await this.transaction((state) => {
      const now = new Date().toISOString();
      for (const allocation of state.allocations.filter((item) => item.invocationId === invocationId && item.state === "planned")) {
        allocation.state = "active";
        allocation.updatedAt = now;
        if (owners[allocation.service]?.process) allocation.process = { ...owners[allocation.service].process!, recordedAt: owners[allocation.service].process!.recordedAt ?? now };
        if (owners[allocation.service]?.container) allocation.container = owners[allocation.service].container;
      }
      const invocation = state.invocations.find((item) => item.id === invocationId);
      if (invocation) {
        // Lease owners are also kept on the invocation, where reconcile and gc
        // of the leases cannot erase them.
        addOwners(invocation, state.allocations.filter((item) => item.invocationId === invocationId).flatMap(allocationOwners));
        Object.assign(invocation, { state: "ready", updatedAt: now });
      }
    });
  }

  public async release(input: { invocationId?: string; instanceId?: string; errorCode?: string }): Promise<void> {
    await this.transaction(async (state) => {
      const now = new Date().toISOString();
      for (const allocation of state.allocations) {
        if ((input.invocationId && allocation.invocationId !== input.invocationId) || (input.instanceId && allocation.instanceId !== input.instanceId)) continue;
        if (!active(allocation)) continue;
        Object.assign(allocation, { state: "released", updatedAt: now, releasedAt: now });
      }
      const stateDir = path.dirname(this.filePath);
      const released = (invocation: RegistryInvocation) => !(input.invocationId && invocation.id !== input.invocationId) && !(input.instanceId && invocation.instanceId !== input.instanceId);
      // Another claim on the same ports keeps protecting them, and meets this
      // rule when it ends in turn: a running lifecycle of the same instance
      // always, any other claim only once this instance has no routes left
      // that could bring the listener back.
      const covers = (invocation: RegistryInvocation, other: RegistryInvocation) => !released(other) && holdsProxyClaim(other) &&
        invocation.proxyListenerPorts!.every((port) => other.proxyListenerPorts?.includes(port));
      const covered = async (invocation: RegistryInvocation) =>
        state.invocations.some((other) => covers(invocation, other) && other.instanceId === invocation.instanceId && CLAIM_STATES.has(other.state)) ||
        (state.invocations.some((other) => covers(invocation, other)) &&
          await withFileLock(path.join(stateDir, "proxy.lock"), async () => await noOwnedProxyRoutes(stateDir, invocation.instanceId)).catch(() => false));
      for (const invocation of state.invocations) {
        if (!released(invocation)) continue;
        // Otherwise the last claim on a listener ends only through the shared
        // evidence: a lifecycle that ends before its routes are removed (a
        // failed replacement or rollback) or while a Caddy it started may
        // still listen (an unconfirmed exit) keeps its claim until then.
        const retain = invocation.proxyClaimRetained === true || (holdsProxyClaim(invocation) && !await covered(invocation) &&
          !await proxyClaimRetirable(stateDir, invocation.instanceId, invocation.proxyListenerPorts!));
        Object.assign(invocation, { state: input.errorCode ? "failed" : "stopped", updatedAt: now, ...(input.errorCode ? { errorCode: input.errorCode } : {}) });
        if (retain) invocation.proxyClaimRetained = true;
        // Teardown resolved the launches before it released them; owners
        // recorded stay as evidence.
        delete invocation.launching;
        delete invocation.composeLaunches;
      }
    });
  }

  /**
   * Whether a lifecycle of this instance may still run. Death evidence is
   * only a recorded process or container identity verified dead; lease age,
   * stale leases, occupied ports and an ended or interrupted invocation state
   * prove nothing. A recently refreshed command and any invocation whose
   * owner journal may still run (see journalMayRun) count as possibly
   * running. Callers hold the routing lock across this check and the action
   * it permits.
   */
  public async instanceMayRun(instanceId: string): Promise<boolean> {
    const state = await withRoutingLock(path.dirname(this.filePath), async () => await this.read());
    for (const invocation of state.invocations.filter((item) => item.instanceId === instanceId)) {
      if (CLAIM_STATES.has(invocation.state) && invocation.state !== "ready" && recentlyRefreshed(invocation)) return true;
      if (await journalMayRun(state, invocation)) return true;
    }
    return false;
  }

  public async reconcile(): Promise<RegistryState> {
    await this.transaction(async (state) => {
      const now = new Date().toISOString();
      for (const allocation of state.allocations.filter((item) => active(item) && !retainedForReplacement(state, item.invocationId) &&
        !stoppingInProgress(state, item.invocationId))) {
        await refreshAllocation(allocation, now, this.availabilityCheck);
      }
      await expireAbandonedProxyClaims(state, path.dirname(this.filePath), now, this.availabilityCheck);
    });
    return await this.read();
  }

  public async gc(): Promise<number> {
    return await this.transaction(async (state) => {
      await expireAbandonedProxyClaims(state, path.dirname(this.filePath), new Date().toISOString(), this.availabilityCheck);
      const before = state.allocations.length;
      // A collected lease's owner stays evidence for its lifecycle.
      for (const allocation of state.allocations) {
        if (allocation.state !== "stale" && allocation.state !== "released") continue;
        const invocation = state.invocations.find((item) => item.id === allocation.invocationId);
        if (invocation) addOwners(invocation, allocationOwners(allocation));
      }
      state.allocations = state.allocations.filter((allocation) => allocation.state !== "stale" && allocation.state !== "released");
      // An ended invocation whose recorded owners may still run is the only
      // evidence that keeps its instance's routes, so it is kept as well.
      const kept: RegistryInvocation[] = [];
      for (const invocation of state.invocations) {
        if (!["failed", "stopped"].includes(invocation.state) || invocation.proxyClaimRetained || await journalMayRun(state, invocation)) kept.push(invocation);
      }
      state.invocations = kept;
      return before - state.allocations.length;
    });
  }
}

export function isProcessAlive(pid: number): boolean {
  return processExists(pid);
}

type DockerInspect = (file: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout: number }) => Promise<{ stdout: string }>;

export async function inspectContainerRunning(owner: NonNullable<PortAllocation["container"]>, run: DockerInspect = execFileAsync as DockerInspect): Promise<boolean | undefined> {
  const dockerKeys = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"];
  const environment = { ...process.env };
  if (owner.dockerEnvironment !== undefined) for (const key of dockerKeys) delete environment[key];
  Object.assign(environment, owner.dockerEnvironment ?? {});
  try { return (await run("docker", ["inspect", "--format", "{{.State.Running}}", owner.id], { env: environment, timeout: 5000 })).stdout.trim() === "true"; }
  catch (error) {
    const candidate = error as { message?: unknown; stderr?: unknown };
    const detail = `${typeof candidate.stderr === "string" ? candidate.stderr : ""}\n${typeof candidate.message === "string" ? candidate.message : ""}`;
    return /no such (?:object|container)/i.test(detail) ? false : undefined;
  }
}

export function renderPortInventory(state: RegistryState): string {
  const rows = state.allocations.filter((item) => item.state !== "released").sort((a, b) => a.port - b.port);
  return [
    "# DevFn port inventory",
    "",
    `Generated from registry revision ${state.revision}.`,
    "",
    "| Port | Protocol | Project | Instance | Service | State | Source |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
    ...rows.map((item) => `| ${item.port} | ${item.protocol} | ${item.projectId} | ${item.instanceId} | ${item.service} | ${item.state} | ${item.source} |`),
    "",
  ].join("\n");
}
