import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { matchesProcessIdentity, processExists } from "@devfn/processes";

import { allocateEphemeralPort, isPortAvailable, scanListenerState } from "./listeners.js";
import { withFileLock, withRoutingLock } from "./lock.js";
import { PortRegistryError, type PortAllocation, type RegistryInvocation, type RegistryState, type ReservationInput, type ReservationRequest } from "./types.js";
import { parsePersistedProxyRoutes } from "./proxy-state.js";
import { parseProxyOwner, proxyOwnerStatus } from "./proxy-owner.js";

const EMPTY: RegistryState = { version: 1, revision: 0, allocations: [], invocations: [] };
const execFileAsync = promisify(execFile);
const ABANDONED_CLAIM_MS = 300_000;

function proxyListenerMigration(port: number): string {
  return `Stop the profile using port ${port}, change its exact/preferred service port, then retry proxy activation; DevFn does not move existing leases.`;
}

// Route files are owned by the proxy. A missing file proves no routes there;
// an unreadable or malformed file cannot prove that a claim is safe to drop.
async function noOwnedProxyRoutes(stateDir: string, instanceId: string): Promise<boolean> {
  for (const name of ["proxy-routes.json", "proxy-routes.pending.json"]) {
    let state: unknown;
    try { state = JSON.parse(await readFile(path.join(stateDir, name), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return false;
    }
    let routes;
    try { routes = parsePersistedProxyRoutes(state); }
    catch { return false; }
    for (const route of routes) {
      if (route.instanceId === instanceId) return false;
    }
  }
  return true;
}

async function proxyClaimHasNoBoundListener(stateDir: string, ports: readonly number[]): Promise<boolean> {
  if (!ports.length || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) return false;
  const scanned = await scanListenerState(false);
  if (scanned.listeners.some((listener) => listener.protocol === "tcp" && ports.includes(listener.port)) ||
    (!scanned.inspection.tcp && ports.some((port) => port < 1024))) return false;
  // Binding is a second check for ordinary ports; privileged Linux ports
  // require OS listener inspection because an unprivileged bind can fail even
  // when no listener exists.
  for (const port of ports) if (port >= 1024 && !await isPortAvailable(port, "tcp", "127.0.0.1")) return false;
  // When OS inspection is unavailable, an IPv4 bind cannot rule out a Caddy
  // listener on ::1 (or an IPv6 wildcard). Keep the cross-protocol claim if
  // IPv6 exists but its listener port cannot be bound conclusively.
  if (!scanned.inspection.tcp && await isPortAvailable(0, "tcp", "::1")) {
    for (const port of ports) {
      if (!await isPortAvailable(port, "tcp", "::1") || !await isPortAvailable(port, "tcp", "::")) return false;
    }
  }
  let owner;
  try { owner = parseProxyOwner(await readFile(path.join(stateDir, "proxy-owner.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  const status = owner ? await proxyOwnerStatus(owner) : "dead";
  if (status === "unverified") return false;
  // A verified Caddy may retain its admin listener after all sites are gone.
  // For an absent/dead/reused owner, an occupied admin port is ambiguous.
  if (status === "active") return true;
  return await isPortAvailable(2019, "tcp", "127.0.0.1");
}

async function refreshAllocation(allocation: PortAllocation, now: string, available: (port: number, protocol: "tcp" | "udp", host: string) => Promise<boolean>): Promise<void> {
  const previousState = allocation.state;
  const portAvailable = await available(allocation.port, allocation.protocol, allocation.host);
  if (allocation.state === "planned" && Date.now() - Date.parse(allocation.updatedAt) > ABANDONED_CLAIM_MS) allocation.state = "stale";
  else if (allocation.state === "active" && allocation.process && !await matchesProcessOwner(allocation.process)) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "active" && allocation.container && await inspectContainerRunning(allocation.container) === false) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "active" && !allocation.process && !allocation.container) allocation.state = portAvailable ? "stale" : "externally-occupied";
  else if (allocation.state === "externally-occupied" && portAvailable) allocation.state = "stale";
  if (allocation.state !== previousState) allocation.updatedAt = now;
}

async function expireAbandonedProxyClaims(state: RegistryState, stateDir: string, now: string,
  available: (port: number, protocol: "tcp" | "udp", host: string) => Promise<boolean>): Promise<void> {
  for (const invocation of state.invocations) {
    if (!invocation.proxyListenerPorts?.length || !["planning", "starting", "ready"].includes(invocation.state) ||
      !Number.isFinite(Date.parse(invocation.updatedAt)) || Date.now() - Date.parse(invocation.updatedAt) <= ABANDONED_CLAIM_MS) continue;
    for (const allocation of state.allocations.filter((item) => item.invocationId === invocation.id && active(item) && !retainedForReplacement(state, item.invocationId))) {
      await refreshAllocation(allocation, now, available);
    }
    if (state.allocations.some((item) => item.invocationId === invocation.id && active(item))) continue;
    // Proxy mutations hold this lock across their route journal and reload.
    // Inspect the route files and physical listener under the same lock so a
    // concurrent activation cannot publish a route while we retire its claim.
    let abandoned = false;
    try {
      abandoned = await withFileLock(path.join(stateDir, "proxy.lock"), async () =>
        await noOwnedProxyRoutes(stateDir, invocation.instanceId) &&
        await proxyClaimHasNoBoundListener(stateDir, invocation.proxyListenerPorts!));
    } catch { /* Inconclusive ownership evidence keeps the claim. */ }
    if (!abandoned) continue;
    Object.assign(invocation, { state: "failed", errorCode: "DEVFN_INTERRUPTED", updatedAt: now });
  }
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

function retainedForReplacement(state: RegistryState, invocationId: string): boolean {
  return state.invocations.some((item) => item.replacingInvocationId === invocationId &&
    (item.state === "planning" || item.state === "starting"));
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
      const claimingInstance = new Map<number, string>();
      for (const port of input.proxyListenerPorts ?? []) claimingInstance.set(port, input.instanceId);
      for (const invocation of state.invocations) {
        if (invocation.id !== input.replacingInvocationId && ["planning", "starting", "ready", "stopping"].includes(invocation.state)) {
          for (const port of invocation.proxyListenerPorts ?? []) {
            proxyPorts.add(port);
            claimingInstance.set(port, invocation.instanceId);
          }
        }
      }
      for (const value of [...(input.protectedPorts ?? []), ...(input.excludedPorts ?? []), ...proxyPorts]) {
        occupied.add(occupancyKey(value, "tcp"));
        occupied.add(occupancyKey(value, "udp"));
      }
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
            const claimant = claimingInstance.get(spec.preferred);
            if (claimant) {
              const action = claimant === input.instanceId
                ? "This profile also selects proxy routes; change the service's exact port before activating them."
                : `Change this service's exact port or stop proxy instance ${claimant} before retrying.`;
              throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${spec.preferred} for ${name} is claimed by proxy instance ${claimant}. ${action}`,
                { service: name, port: spec.preferred, instanceId: claimant, action });
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
      for (const request of requests) {
        const port = request.spec.exact ? request.spec.preferred : undefined;
        if (port === undefined) continue;
        if (ports.includes(port)) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is claimed by this profile's proxy; change the service's exact port before activating proxy routes.`,
          { port, service: request.name, instanceId: exceptInstanceId });
        const lease = state.allocations.find((item) => active(item) && item.instanceId !== exceptInstanceId && item.port === port && item.protocol === (request.spec.protocol ?? "tcp"));
        if (lease) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is leased by ${lease.instanceId}/${lease.service}.`,
          { port, service: request.name, instanceId: lease.instanceId });
        const claimant = state.invocations.find((item) => item.instanceId !== exceptInstanceId && ["planning", "starting", "ready", "stopping"].includes(item.state) && item.proxyListenerPorts?.includes(port));
        if (claimant) throw new PortRegistryError("DEVFN_PORT_CONFLICT", `Exact port ${port} for ${request.name} is claimed by proxy instance ${claimant.instanceId}.`,
          { port, service: request.name, instanceId: claimant.instanceId });
        const protocol = request.spec.protocol ?? "tcp";
        // reserve reuses an exact port by ready invocation, even when a
        // replacement renames the service. Keep preflight's ownership rule
        // identical so it cannot reject a safe rename before teardown.
        const host = request.spec.exposure === "public" ? "0.0.0.0" : "127.0.0.1";
        const owned = Boolean(readyReplacement) && state.allocations.some((item) => active(item) && item.invocationId === replacingInvocationId &&
          item.instanceId === exceptInstanceId && item.port === port && item.protocol === protocol && item.host === host);
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

  public async recoverInterrupted(instanceId: string): Promise<number> {
    return await this.transaction((state) => {
      const now = new Date().toISOString();
      const interrupted = new Set(state.invocations.filter((invocation) => invocation.instanceId === instanceId && ["planning", "starting"].includes(invocation.state)).map((invocation) => invocation.id));
      for (const allocation of state.allocations) {
        if (allocation.instanceId !== instanceId || allocation.state !== "planned") continue;
        Object.assign(allocation, { state: "released", updatedAt: now, releasedAt: now });
      }
      for (const invocation of state.invocations) {
        if (!interrupted.has(invocation.id) || !["planning", "starting"].includes(invocation.state)) continue;
        Object.assign(invocation, { state: "failed", errorCode: "DEVFN_INTERRUPTED", updatedAt: now });
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
        if (owners[allocation.service]?.process) allocation.process = owners[allocation.service].process;
        if (owners[allocation.service]?.container) allocation.container = owners[allocation.service].container;
      }
      const invocation = state.invocations.find((item) => item.id === invocationId);
      if (invocation) Object.assign(invocation, { state: "ready", updatedAt: now });
    });
  }

  /** Refresh a retained ready lease after a failed replacement restarts its owner. */
  public async replaceOwners(invocationId: string, owners: Record<string, { process?: PortAllocation["process"]; container?: PortAllocation["container"] }>): Promise<void> {
    await this.transaction((state) => {
      const invocation = state.invocations.find((item) => item.id === invocationId && item.state === "ready");
      if (!invocation) throw new PortRegistryError("DEVFN_REGISTRY_INVALID", "The prior ready invocation no longer owns its recovery leases.");
      for (const allocation of state.allocations.filter((item) => item.invocationId === invocationId && item.state === "active")) {
        allocation.process = owners[allocation.service]?.process;
        allocation.container = owners[allocation.service]?.container;
        allocation.updatedAt = new Date().toISOString();
      }
    });
  }

  public async release(input: { invocationId?: string; instanceId?: string; errorCode?: string }): Promise<void> {
    await this.transaction((state) => {
      const now = new Date().toISOString();
      for (const allocation of state.allocations) {
        if ((input.invocationId && allocation.invocationId !== input.invocationId) || (input.instanceId && allocation.instanceId !== input.instanceId)) continue;
        if (!active(allocation)) continue;
        Object.assign(allocation, { state: "released", updatedAt: now, releasedAt: now });
      }
      for (const invocation of state.invocations) {
        if ((input.invocationId && invocation.id !== input.invocationId) || (input.instanceId && invocation.instanceId !== input.instanceId)) continue;
        Object.assign(invocation, { state: input.errorCode ? "failed" : "stopped", updatedAt: now, ...(input.errorCode ? { errorCode: input.errorCode } : {}) });
      }
    });
  }

  public async reconcile(): Promise<RegistryState> {
    await this.transaction(async (state) => {
      const now = new Date().toISOString();
      for (const allocation of state.allocations.filter((item) => active(item) && !retainedForReplacement(state, item.invocationId) &&
        !state.invocations.some((invocation) => invocation.id === item.invocationId && invocation.state === "stopping"))) {
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
      state.allocations = state.allocations.filter((allocation) => allocation.state !== "stale" && allocation.state !== "released");
      state.invocations = state.invocations.filter((invocation) => !["failed", "stopped"].includes(invocation.state));
      return before - state.allocations.length;
    });
  }
}

export function isProcessAlive(pid: number): boolean {
  return processExists(pid);
}

async function matchesProcessOwner(owner: NonNullable<PortAllocation["process"]>): Promise<boolean> {
  return await matchesProcessIdentity(owner.pid, owner.birthSignature);
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
