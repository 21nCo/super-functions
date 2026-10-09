import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ComposeController, composeProjectName, createComposeEnvironment, createComposeReadinessEnvironment, effectiveComposeServiceNetworks, fingerprintComposeSource, selectedComposeEndpointReferences, type ManagedComposeService } from "@devfn/compose";
import { defaultStateDir, isCredentialKey, loadDevFnPolicy, validateDevFnConfig, type DevFnConfig, type HealthCheck } from "@devfn/config";
import { FilePortRegistry, isPortAvailable, resolvePolicy, scanListenerState, withFileLock, type ListenerInfo, type ListenerScanResult, type PortAllocation } from "@devfn/ports";
import { checkReadinessNow, createProcessEnvironment, resolveAdapterCommand, ProcessSupervisor, processExists, type ManagedProcess } from "@devfn/processes";
import { CaddyProxyController, proxyListenerPorts, readRegisteredDomains, renderCaddyfile, verifyCertificate, verifyLocalDns, type ProxyRoute } from "@devfn/proxy";

import { domainAliases, resolveInstanceIdentity } from "./identity.js";
import { resolveEndpointTemplates, resolveLocalHostname } from "./endpoints.js";
import { createPlan } from "./planner.js";
import { readReceipt, secureRuntimeDirectory, writeEnvironmentOutputs, writeReceipt } from "./runtime.js";
import { DevFnError, type CleanupResult, type InstanceIdentity, type RoutingIdentity, type LifecyclePlan, type LifecycleReceipt, type UpOptions } from "./types.js";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

async function isProcessTreeMember(pid: number, ownerPid: number): Promise<boolean> {
  if (pid === ownerPid) return true;
  try {
    if (process.platform === "win32") {
      const script = `$current=${pid}; while ($current -gt 0) { if ($current -eq ${ownerPid}) { exit 0 }; $entry=Get-CimInstance Win32_Process -Filter \"ProcessId = $current\"; if (-not $entry) { break }; $current=$entry.ParentProcessId }; exit 1`;
      await execFileAsync("powershell", ["-NoProfile", "-Command", script], { timeout: 5000 });
      return true;
    }
    const { stdout } = await execFileAsync("ps", ["-o", "pgid=", "-p", String(pid)], { timeout: 5000 });
    return Number(stdout.trim()) === ownerPid;
  } catch { return false; }
}

function assertReceiptStateDir(receipt: LifecycleReceipt, stateDir: string): void {
  if (receipt.stateDir && path.resolve(receipt.stateDir) !== path.resolve(stateDir)) {
    throw new DevFnError("DEVFN_RUNTIME_INVALID", `This invocation was started with state directory ${receipt.stateDir}; rerun cleanup with that same --state-dir.`);
  }
}

function resolvedHealth(health: HealthCheck | undefined, command: string[] | undefined, url?: string): HealthCheck | undefined {
  if (health?.type === "command" && command) return { ...health, command };
  if (health?.type === "http" && url) return { type: "http", url, ...(health.expectedStatus ? { expectedStatus: health.expectedStatus } : {}), ...(health.timeoutMs ? { timeoutMs: health.timeoutMs } : {}) };
  return health;
}

function provisionalComposeNetworks(config: DevFnConfig, plan: LifecyclePlan, ownerId: string): Record<string, string[]> {
  return Object.fromEntries(plan.nodes.filter((node) => node.kind === "service").map((node) =>
    [node.name, [`${composeProjectName(config.services![node.name].projectName ?? "devfn", ownerId)}_default`]]));
}

async function needsNetworkPreflight(config: DevFnConfig, plan: LifecyclePlan, root: string, identity: RoutingIdentity,
  ports: Record<string, number>, hostnameSuffix?: string): Promise<boolean> {
  // A selected sibling URL reference must fail before creating lifecycle state.
  // Without one, pure template validation is enough here; the locked pass
  // below still reads effective Compose networks before startup or publication.
  if (JSON.stringify(config).includes("{{env.DEVFN_URL_")) return true;
  const provisional = resolveEndpointTemplates({ config, plan, ownerId: identity.instanceId, ports, hostnameSuffix, routingIdentity: identity,
    composeNetworks: provisionalComposeNetworks(config, plan, identity.instanceId) });
  const deadline = Date.now() + 20_000;
  for (const node of plan.nodes) {
    if (node.kind !== "service") continue;
    const spec = config.services![node.name];
    const selected = provisional.nodes[node.name].environment;
    const environment = createComposeEnvironment({ ...spec, env: selected }, selected);
    if ((await selectedComposeEndpointReferences({ ...spec, env: selected }, root, environment, deadline)).size) return true;
  }
  return false;
}

async function resolveWithComposeNetworks(config: DevFnConfig, plan: LifecyclePlan, root: string, identity: RoutingIdentity, ports: Record<string, number>, hostnameSuffix?: string): Promise<ReturnType<typeof resolveEndpointTemplates>> {
  // Validate literals before calling Docker. Provisional defaults are used only
  // for that read-only validation; the result is never published or started.
  const ownerId = identity.instanceId;
  const provisionalNetworks = provisionalComposeNetworks(config, plan, ownerId);
  const provisional = resolveEndpointTemplates({ config, plan, ownerId, ports, hostnameSuffix, routingIdentity: identity, composeNetworks: provisionalNetworks });
  const composeNetworks: Record<string, string[]> = {};
  const composeReferences: Record<string, Set<string>> = {};
  const deadline = Date.now() + 20_000;
  for (const node of plan.nodes) {
    if (node.kind !== "service") continue;
    const spec = config.services![node.name];
    const environment = createComposeEnvironment({ ...spec, env: provisional.nodes[node.name].environment }, provisional.nodes[node.name].environment);
    const references = new Set<string>();
    composeNetworks[node.name] = await effectiveComposeServiceNetworks({ ...spec, env: provisional.nodes[node.name].environment }, root, ownerId, environment, deadline, references);
    composeReferences[node.name] = references;
  }
  return resolveEndpointTemplates({ config, plan, ownerId, ports, hostnameSuffix, routingIdentity: identity, composeNetworks, composeReferences });
}

function compareCodepoint(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function startupFingerprints(config: DevFnConfig, root: string, resolved: ReturnType<typeof resolveEndpointTemplates>): Promise<Record<string, string>> {
  const fingerprints: Record<string, string> = {};
  const deadline = Date.now() + 20_000;
  for (const [name, node] of Object.entries(resolved.nodes)) {
    const processSpec = config.processes?.[name];
    const serviceSpec = config.services?.[name];
    const secretNames = new Set([...(processSpec?.secretEnv ?? []), ...(serviceSpec?.secretEnv ?? [])]);
    const declaredEnvironment = Object.entries(node.environment).sort(([a], [b]) => compareCodepoint(a, b))
      .map(([key, value]) => [key, secretNames.has(key) || isCredentialKey(key) ? "<secret-channel>" : value]);
    let startup: unknown;
    if (processSpec) {
      const spec = { ...processSpec, env: node.environment, command: node.command, script: node.script };
      startup = {
        kind: "process", command: resolveAdapterCommand(spec), cwd: processSpec.cwd ?? ".",
        exposure: processSpec.exposure ?? "local", ports: processSpec.ports ?? [],
        environment: declaredEnvironment,
        inheritedEnvironment: Object.entries(createProcessEnvironment(spec))
          .filter(([key]) => processSpec.envAllowlist?.includes(key) && !Object.hasOwn(node.environment, key))
          .sort(([a], [b]) => compareCodepoint(a, b))
          .map(([key, value]) => [key, secretNames.has(key) || isCredentialKey(key) ? "<secret-channel>" : value]),
        envAllowlist: [...(processSpec.envAllowlist ?? [])].sort(compareCodepoint), secretEnv: [...(processSpec.secretEnv ?? [])].sort(compareCodepoint),
      };
    } else if (serviceSpec) {
      const spec = { ...serviceSpec, env: node.environment };
      const environment = createComposeEnvironment(spec, node.environment);
      startup = {
        kind: "service", file: serviceSpec.file ?? "compose.yaml", service: serviceSpec.service,
        projectName: serviceSpec.projectName ?? "devfn", ports: serviceSpec.ports ?? {},
        environment: declaredEnvironment,
        envAllowlist: [...(serviceSpec.envAllowlist ?? [])].sort(compareCodepoint), secretEnv: [...(serviceSpec.secretEnv ?? [])].sort(compareCodepoint),
        source: await fingerprintComposeSource(spec, root, resolved.ownerId, environment, deadline),
      };
    } else continue;
    fingerprints[name] = createHash("sha256").update(JSON.stringify(startup)).digest("hex");
  }
  return fingerprints;
}

function portSpecFingerprints(config: DevFnConfig, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => {
    const spec = config.ports?.[name] ?? {};
    const canonical = { ...spec, protocol: spec.protocol ?? "tcp", exposure: spec.exposure ?? "loopback" };
    if (!canonical.exact) delete canonical.exact;
    if (!canonical.ephemeral) delete canonical.ephemeral;
    return [name, createHash("sha256")
      .update(JSON.stringify(Object.entries(canonical).sort(([a], [b]) => compareCodepoint(a, b))))
      .digest("hex")];
  }));
}

function isDockerProxyListener(processName?: string): boolean {
  return Boolean(processName && /^(?:docker-proxy|com\.docker|vpnkit)/i.test(processName));
}

export function selectOwnershipListeners(allocation: PortAllocation | undefined, matches: ListenerInfo[]): ListenerInfo[] {
  const ownedDocker = allocation?.container !== undefined && matches.some((listener) => listener.source === "docker" && listener.containerId !== undefined && (allocation.container!.id.startsWith(listener.containerId) || listener.containerId.startsWith(allocation.container!.id)));
  return ownedDocker ? matches.filter((listener) => listener.source === "docker" || !isDockerProxyListener(listener.process)) : matches;
}

export function hasRecordedProcessOwner(allocations: readonly PortAllocation[], projectId: string, instanceId: string, localProcessPorts: ReadonlyMap<string, "tcp" | "udp">, protocol: "tcp" | "udp"): boolean {
  return allocations.some((allocation) => allocation.projectId === projectId && allocation.instanceId === instanceId && allocation.state === "active" && allocation.process !== undefined && allocation.protocol === protocol && localProcessPorts.get(allocation.service) === protocol);
}

export function resolveAllocationUrls(allocations: readonly PortAllocation[], routes: readonly ProxyRoute[], httpPorts: ReadonlySet<string>, directUrls: Readonly<Record<string, string>> = {}): Record<string, string> {
  const urls: Record<string, string> = {};
  const listenerPorts = proxyListenerPorts();
  for (const allocation of allocations) {
    // A service can have several aliases and paths. Prefer a root URL, then
    // choose by stable route ID instead of the persisted route order.
    const route = allocation.protocol === "tcp" ? routes.filter((item) => item.targetPort === allocation.port)
      .sort((a, b) => {
        const rootA = (a.path ?? "/") === "/" ? 0 : 1;
        const rootB = (b.path ?? "/") === "/" ? 0 : 1;
        return rootA - rootB || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      })[0] : undefined;
    if (route) {
      const port = route.tls === "off" ? listenerPorts.httpPort : listenerPorts.httpsPort;
      urls[allocation.service] = `${route.tls === "off" ? "http" : "https"}://${route.hostname}${port === (route.tls === "off" ? 80 : 443) ? "" : `:${port}`}${route.path && route.path !== "/" ? route.path : ""}`;
    }
    else if (allocation.protocol === "tcp" && httpPorts.has(allocation.service)) urls[allocation.service] = directUrls[allocation.service] ?? `http://127.0.0.1:${allocation.port}`;
  }
  return urls;
}

async function selectedProxyRoutes(config: DevFnConfig, plan: LifecyclePlan, identity: RoutingIdentity, ports: Readonly<Record<string, number>>, suffix: string, stateDir: string, verifyActivation = true): Promise<Array<Omit<ProxyRoute, "updatedAt">>> {
  if (!plan.proxy) return [];
  const registrations = Object.values(config.hostnames ?? {}).some((spec) => spec.domain && (!spec.profiles || spec.profiles.includes(plan.profile)))
    ? await readRegisteredDomains(stateDir) : [];
  const routes: Array<Omit<ProxyRoute, "updatedAt">> = [];
  for (const [name, spec] of Object.entries(config.hostnames ?? {}).filter(([, value]) => !value.profiles || value.profiles.includes(plan.profile))) {
    if (!plan.portNames.includes(spec.target) || !Number.isInteger(ports[spec.target])) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Selected route ${name} has no selected target port.`);
    const common = { instanceId: identity.instanceId, targetHost: "127.0.0.1", targetPort: ports[spec.target],
      ...(spec.path ? { path: spec.path } : {}), ...(spec.match ? { match: spec.match } : {}), ...(spec.stripPrefix ? { stripPrefix: true } : {}) };
    if (!spec.domain) {
      routes.push({ ...common, id: `${identity.instanceId}:${name}`, hostname: resolveLocalHostname(spec.hostname, name, config.project.id, identity.instanceId, suffix), tls: spec.tls ?? "off" });
      continue;
    }
    const registration = registrations.find((item) => item.domain === spec.domain && item.projectId === config.project.id && item.repositoryIdentity === identity.repositoryIdentity);
    if (!registration) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Domain ${spec.domain} is not registered to this repository and project.`);
    let aliases: string[];
    try { aliases = domainAliases(spec.host ?? name, spec.domain, identity); }
    catch (error) { throw new DevFnError("DEVFN_RUNTIME_INVALID", `Route ${name}: ${error instanceof Error ? error.message : String(error)}`); }
    for (const [index, hostname] of aliases.entries()) {
      if (verifyActivation) {
        await verifyLocalDns(hostname);
        if (registration.tls === "certificate") await verifyCertificate(hostname, registration.certificateFile, registration.keyFile);
      }
      routes.push({ ...common, id: `${identity.instanceId}:${name}:${index}`, hostname, tls: registration.tls,
        registeredDomain: registration.domain, projectId: registration.projectId, repositoryIdentity: registration.repositoryIdentity,
        ...(registration.certificateFile ? { certificateFile: registration.certificateFile, keyFile: registration.keyFile } : {}) });
    }
  }
  renderCaddyfile(routes.map((route) => ({ ...route, updatedAt: "preflight" })));
  return routes;
}

function receiptRoutesMatch(receipt: LifecycleReceipt, expected: readonly Omit<ProxyRoute, "updatedAt">[]): boolean {
  if (receipt.routes.length !== expected.length) return false;
  const actual = new Map(receipt.routes.map((route) => [route.id, route]));
  if (actual.size !== expected.length) return false;
  return expected.every((route) => {
    const saved = actual.get(route.id);
    if (!saved) return false;
    const current = saved as unknown as Record<string, unknown>;
    const planned = route as unknown as Record<string, unknown>;
    if (current.certificateDigest !== undefined &&
      (route.tls !== "certificate" || typeof current.certificateDigest !== "string" || !/^[a-f0-9]{64}$/.test(current.certificateDigest))) return false;
    return new Set([...Object.keys(current).filter((key) => key !== "updatedAt" && key !== "certificateDigest"), ...Object.keys(planned)]).size === Object.keys(planned).length &&
      Object.entries(planned).every(([key, value]) => current[key] === value);
  });
}

function selectedHttpPorts(config: DevFnConfig, plan: LifecyclePlan): Set<string> {
  const ports = new Set<string>();
  for (const node of plan.nodes) {
    const health = node.kind === "process" ? config.processes?.[node.name]?.health : config.services?.[node.name]?.health;
    if (health?.type === "http" && health.port) ports.add(health.port);
  }
  return ports;
}

function startupOwners(config: DevFnConfig, receipt: LifecycleReceipt): Record<string, { process?: PortAllocation["process"]; container?: PortAllocation["container"] }> {
  const owners: Record<string, { process?: PortAllocation["process"]; container?: PortAllocation["container"] }> = {};
  for (const process of receipt.processes) {
    for (const name of config.processes?.[process.name]?.ports ?? []) {
      owners[name] = { process: { pid: process.pid, ...(process.birthSignature ? { birthSignature: process.birthSignature } : {}) } };
    }
  }
  for (const service of receipt.services) {
    for (const name of Object.keys(config.services?.[service.name]?.ports ?? {})) {
      owners[name] = { container: { id: service.containerIds[0], name: service.composeService,
        ...(service.dockerEnvironment !== undefined ? { dockerEnvironment: service.dockerEnvironment } : {}) } };
    }
  }
  return owners;
}

export async function verifyOwnedLoopbackListeners(processName: string, expected: Array<{ port: number; protocol: "tcp" | "udp" }>, ownerPid: number, scan: ListenerScanResult): Promise<{ port: number; protocol: "tcp" | "udp" } | undefined> {
  const requiredProtocols = new Set<"tcp" | "udp">(expected.length ? expected.map((item) => item.protocol) : ["tcp", "udp"]);
  for (const protocol of requiredProtocols) {
    if (!scan.inspection[protocol]) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Process ${processName} ${protocol.toUpperCase()} listeners could not be inspected for loopback ownership.`);
  }
  const candidates = scan.listeners.filter((listener) => listener.source === "os" && listener.pid !== undefined && (expected.length === 0 || expected.some((item) => item.port === listener.port && item.protocol === listener.protocol)));
  const ownership = await Promise.all(candidates.map(async (listener) => await isProcessTreeMember(listener.pid!, ownerPid)));
  const owned = candidates.filter((_listener, index) => ownership[index]);
  const unsafe = owned.find((listener) => !isLoopbackHost(listener.host));
  if (unsafe) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Process ${processName} exposed port ${unsafe.port} beyond loopback.`);
  return expected.find((item) => !owned.some((listener) => listener.port === item.port && listener.protocol === item.protocol));
}

async function waitForOwnedLoopbackListeners(processName: string, expected: Array<{ port: number; protocol: "tcp" | "udp" }>, ownerPid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let missing: { port: number; protocol: "tcp" | "udp" } | undefined;
  do {
    if (!processExists(ownerPid)) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Process ${processName} exited before listener ownership could be verified.`);
    const scan = await scanListenerState(false);
    missing = await verifyOwnedLoopbackListeners(processName, expected, ownerPid, scan);
    if (!missing) return;
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new DevFnError("DEVFN_RUNTIME_INVALID", `Process ${processName} ${missing!.protocol.toUpperCase()} port ${missing!.port} has no verified loopback listener owned by its process tree after ${timeoutMs} ms.`);
}

async function receiptIsReady(config: DevFnConfig, root: string, receipt: LifecycleReceipt, processStates: readonly string[], serviceStates: readonly string[]): Promise<boolean> {
  const ports = Object.fromEntries(receipt.allocations.map((allocation) => [allocation.service, allocation.port]));
  let resolved: ReturnType<typeof resolveEndpointTemplates>;
  try {
    const plan = createPlan(config, receipt.profile);
    if (plan.portNames.length !== receipt.allocations.length || plan.portNames.some((name) => ports[name] === undefined ||
      (config.ports?.[name]?.exact === true && config.ports[name].preferred !== ports[name])) ||
      plan.nodes.length !== receipt.processes.length + receipt.services.length ||
      plan.nodes.some((node) => !(node.kind === "process" ? receipt.processes : receipt.services).some((managed) => managed.name === node.name))) return false;
    if (receipt.portSpecFingerprints) {
      const currentPorts = portSpecFingerprints(config, plan.portNames);
      if (Object.keys(currentPorts).length !== Object.keys(receipt.portSpecFingerprints).length ||
        Object.entries(currentPorts).some(([name, fingerprint]) => receipt.portSpecFingerprints?.[name] !== fingerprint)) return false;
    }
    if (receipt.allocations.some((allocation) => allocation.protocol !== (config.ports?.[allocation.service]?.protocol ?? "tcp") ||
      allocation.host !== (config.ports?.[allocation.service]?.exposure === "public" ? "0.0.0.0" : "127.0.0.1"))) return false;
    const loadedPolicy = await loadDevFnPolicy(root, config.policy);
    const identity = await resolveInstanceIdentity(config.project.id, root);
    resolved = await resolveWithComposeNetworks(config, plan, root, identity, ports, loadedPolicy?.policy.hostnameSuffix);
    if (!receiptRoutesMatch(receipt, await selectedProxyRoutes(config, plan, identity, ports,
      loadedPolicy?.policy.hostnameSuffix ?? ".localhost", receipt.stateDir ?? defaultStateDir(), false))) return false;
    const currentUrls = resolveAllocationUrls(receipt.allocations, receipt.routes, selectedHttpPorts(config, plan), resolved.directUrls);
    if (Object.keys(currentUrls).length !== Object.keys(receipt.urls).length ||
      Object.entries(currentUrls).some(([name, url]) => receipt.urls[name] !== url)) return false;
    if (receipt.startupFingerprints) {
      const current = await startupFingerprints(config, root, resolved);
      if (Object.keys(current).length !== Object.keys(receipt.startupFingerprints).length ||
        Object.entries(current).some(([name, fingerprint]) => receipt.startupFingerprints?.[name] !== fingerprint)) return false;
    }
  } catch { return false; }
  const compose = new ComposeController();
  const supervisor = new ProcessSupervisor();
  const processReady = await Promise.all(receipt.processes.map(async (managed, index) => {
    const spec = config.processes?.[managed.name];
    if (!spec || processStates[index] !== "running") return false;
    try {
      const ready = await checkReadinessNow({
        health: resolvedHealth(spec.health, resolved.nodes[managed.name]?.healthCommand, resolved.nodes[managed.name]?.healthUrl), ports, logPath: managed.logPath, cwd: managed.cwd, environment: createProcessEnvironment({ ...spec, env: resolved.nodes[managed.name]?.environment }, resolved.generated),
        previouslyReady: Boolean(managed.readyAt || receipt.state === "ready"), isAlive: async () => await supervisor.status(managed) === "running",
      });
      if (!ready || spec.exposure === "public") return ready;
      const expected = (spec.ports ?? []).map((name) => ({ port: ports[name], protocol: config.ports?.[name]?.protocol ?? "tcp" }));
      return !(await verifyOwnedLoopbackListeners(managed.name, expected, managed.pid, await scanListenerState(false)));
    } catch { return false; }
  }));
  const serviceReady = await Promise.all(receipt.services.map(async (managed, index) => {
    const spec = config.services?.[managed.name];
    if (!spec || serviceStates[index] !== "running") return false;
    return await checkReadinessNow({
      health: resolvedHealth(spec.health, resolved.nodes[managed.name]?.healthCommand, resolved.nodes[managed.name]?.healthUrl), ports, logPath: "", cwd: root, environment: createComposeReadinessEnvironment(spec, resolved.nodes[managed.name]?.readinessEnvironment ?? {}),
      previouslyReady: receipt.state === "ready", isAlive: async () => await compose.status(managed) === "running",
      readLog: async () => await compose.logs({ ...managed, logsDisabled: Boolean(managed.logsDisabled || spec.secretEnv?.length) }, 1000, managed.startedAt),
    });
  }));
  return processReady.every(Boolean) && serviceReady.every(Boolean);
}

export class DevFnOrchestrator {
  public async up(options: UpOptions): Promise<LifecycleReceipt> {
    validateDevFnConfig(options.config);
    const plan = createPlan(options.config, options.profile);
    const publicNodes = plan.nodes.filter((node) => node.kind === "process" && options.config.processes?.[node.name]?.exposure === "public").map((node) => node.name);
    const publicPorts = plan.portNames.filter((name) => options.config.ports?.[name]?.exposure === "public");
    if ((publicNodes.length || publicPorts.length) && !options.allowPublic) {
      throw new DevFnError("DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED", "This profile declares public exposure. Review it and rerun with --allow-public.", { processes: publicNodes, ports: publicPorts });
    }
    const requestedStateDir = options.stateDir ?? defaultStateDir();
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    const loadedPolicy = await loadDevFnPolicy(options.root, options.config.policy);
    // Effective network evidence must reject unreachable sibling references
    // before state creation. Re-read it under the lifecycle lock after ports
    // are reserved because the Compose source can change between these steps.
    const preflightPorts = Object.fromEntries(plan.portNames.map((name) => [name, 1]));
    await selectedProxyRoutes(options.config, plan, identity, preflightPorts, loadedPolicy?.policy.hostnameSuffix ?? ".localhost", requestedStateDir);
    if (await needsNetworkPreflight(options.config, plan, options.root, identity, preflightPorts, loadedPolicy?.policy.hostnameSuffix)) {
      await resolveWithComposeNetworks(options.config, plan, options.root, identity, preflightPorts, loadedPolicy?.policy.hostnameSuffix);
    } else {
      resolveEndpointTemplates({ config: options.config, plan, ownerId: identity.instanceId, routingIdentity: identity, ports: preflightPorts,
        hostnameSuffix: loadedPolicy?.policy.hostnameSuffix, composeNetworks: provisionalComposeNetworks(options.config, plan, identity.instanceId) });
    }
    await mkdir(requestedStateDir, { recursive: true, mode: 0o700 });
    const stateDir = await realpath(requestedStateDir);
    return await withFileLock(path.join(stateDir, `lifecycle-${identity.instanceId}.lock`), async () => await this.upLocked(options, stateDir, identity, loadedPolicy), { timeoutMs: 30_000 });
  }

  private async upLocked(options: UpOptions, stateDir: string, identity: RoutingIdentity, loadedPolicy: Awaited<ReturnType<typeof loadDevFnPolicy>>): Promise<LifecycleReceipt> {
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const plan = createPlan(options.config, options.profile);
    const profileHostnames = Object.entries(options.config.hostnames ?? {}).filter(([, spec]) => !spec.profiles || spec.profiles.includes(plan.profile));
    const listenerPorts = plan.proxy && profileHostnames.length ? Object.values(proxyListenerPorts()) : [];
    const preflightPorts = Object.fromEntries(plan.portNames.map((name) => [name, 1]));
    const routes = await selectedProxyRoutes(options.config, plan, identity, preflightPorts,
      loadedPolicy?.policy.hostnameSuffix ?? ".localhost", stateDir);
    await registry.assertReplacementAvailable(listenerPorts, identity.instanceId,
      plan.portNames.map((name) => ({ name, spec: options.config.ports?.[name] ?? {} })),
      async () => { if (routes.length) await new CaddyProxyController(stateDir).assertRouteOwnershipAvailable(routes, identity.instanceId); });
    await this.prepareExisting(options, stateDir, identity, loadedPolicy, registry);
    await registry.recoverInterrupted(identity.instanceId);
    const publicNodes = plan.nodes.filter((node) => node.kind === "process" && options.config.processes?.[node.name]?.exposure === "public").map((node) => node.name);
    const publicPorts = plan.portNames.filter((name) => options.config.ports?.[name]?.exposure === "public");
    if ((publicNodes.length || publicPorts.length) && !options.allowPublic) {
      throw new DevFnError("DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED", "This profile declares public exposure. Review it and rerun with --allow-public.", { processes: publicNodes, ports: publicPorts });
    }
    const invocationId = randomUUID();
    const runtimeDir = await secureRuntimeDirectory(options.config, options.root, identity.instanceId);
    const policy = resolvePolicy(loadedPolicy?.policy ?? null, options.config.project.id);
    const suffix = loadedPolicy?.policy.hostnameSuffix ?? ".localhost";
    const configuredHostnames = Object.fromEntries(profileHostnames.filter(([, spec]) => !spec.domain).map(([name, spec]) => [spec.target, resolveLocalHostname(spec.hostname, name, options.config.project.id, identity.instanceId, suffix)]));
    const allocations = await registry.reserve({
      projectId: options.config.project.id,
      instanceId: identity.instanceId,
      invocationId,
      profile: plan.profile,
      requests: plan.portNames.map((name) => ({ name, spec: options.config.ports?.[name] ?? {}, ...(configuredHostnames[name] ? { hostname: configuredHostnames[name] } : {}) })),
      ...policy,
      // A selected proxy route claims both listener ports across protocols.
      // The registry excludes active claims from sibling reservations while
      // keeping no-proxy v0.1 allocations unchanged until Caddy is requested.
      ...(listenerPorts.length ? { proxyListenerPorts: listenerPorts } : {}),
    });
    const ports = Object.fromEntries(allocations.map((item) => [item.service, item.port]));
    let resolved: ReturnType<typeof resolveEndpointTemplates>;
    try { resolved = await resolveWithComposeNetworks(options.config, plan, options.root, identity, ports, suffix); }
    catch (error) {
      await registry.release({ invocationId, errorCode: "DEVFN_ENDPOINT_RESOLUTION_FAILED" });
      throw error;
    }
    const environment = resolved.environment;
    let fingerprints: Record<string, string>;
    try { fingerprints = await startupFingerprints(options.config, options.root, resolved); }
    catch (error) {
      await registry.release({ invocationId, errorCode: "DEVFN_STARTUP_FINGERPRINT_FAILED" });
      throw error;
    }
    const receipt: LifecycleReceipt = {
      version: 1, projectId: options.config.project.id, instanceId: identity.instanceId, invocationId, profile: plan.profile,
      state: "starting", root: options.root, runtimeDir, stateDir: path.resolve(stateDir), startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      allocations, processes: [], services: [], startedNodes: [], routes: [], urls: {}, environmentOutputs: [],
      startupFingerprints: fingerprints,
      portSpecFingerprints: portSpecFingerprints(options.config, plan.portNames),
    };
    try {
      await registry.updateInvocation(invocationId, { state: "starting" });
      await writeReceipt(receipt);
    } catch (error) {
      await registry.release({ invocationId, errorCode: "DEVFN_RECEIPT_WRITE_FAILED" }).catch(() => undefined);
      throw error;
    }
    const heartbeat = setInterval(() => { void registry.updateInvocation(invocationId, {}).catch(() => undefined); }, 60_000);
    heartbeat.unref();
    const supervisor = new ProcessSupervisor();
    const compose = new ComposeController();
    const proxy = new CaddyProxyController(stateDir);
    try {
      receipt.environmentOutputs = await writeEnvironmentOutputs(options.root, runtimeDir, options.config.environmentOutputs ?? [], environment);
      for (const node of plan.nodes) {
        await this.startSelectedNode(node, { options, identity, receipt, resolved, ports, allocations, supervisor, compose });
        receipt.updatedAt = new Date().toISOString();
        await writeReceipt(receipt);
      }
      if (plan.proxy) {
        const routes = await selectedProxyRoutes(options.config, plan, identity, ports, suffix, stateDir);
        receipt.routes = await proxy.upsert(routes, identity.instanceId);
      }
      receipt.urls = resolveAllocationUrls(allocations, receipt.routes, selectedHttpPorts(options.config, plan), resolved.directUrls);
      clearInterval(heartbeat);
      await registry.markActive(invocationId, startupOwners(options.config, receipt));
      receipt.state = "ready";
      receipt.updatedAt = new Date().toISOString();
      await writeReceipt(receipt);
      return receipt;
    } catch (error) {
      const cleanup = await this.cleanup(receipt, registry, supervisor, compose, proxy, true);
      receipt.state = "failed";
      receipt.cleanup = cleanup;
      receipt.error = { code: error && typeof error === "object" && "code" in error ? String(error.code) : "DEVFN_START_FAILED", message: error instanceof Error ? error.message : String(error) };
      receipt.updatedAt = new Date().toISOString();
      await writeReceipt(receipt);
      throw new DevFnError("DEVFN_START_FAILED", `DevFn startup failed: ${receipt.error.message}`, { cleanup, causeCode: receipt.error.code });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async prepareExisting(options: UpOptions, stateDir: string, identity: RoutingIdentity, loadedPolicy: Awaited<ReturnType<typeof loadDevFnPolicy>>, registry: FilePortRegistry): Promise<void> {
    const existing = await readReceipt(options.config, options.root, identity.instanceId);
    if (existing && existing.state !== "stopped") {
      assertReceiptStateDir(existing, stateDir);
      const processStates = await Promise.all(existing.processes.map((item) => new ProcessSupervisor().status(item)));
      const serviceStates = await Promise.all(existing.services.map((item) => new ComposeController().status(item)));
      const managedCount = processStates.length + serviceStates.length;
      const allRunning = managedCount > 0 && processStates.every((state) => state === "running") && serviceStates.every((state) => state === "running");
      const allReady = allRunning && existing.profile === (options.profile ?? options.config.defaultProfile ?? "default") &&
        await receiptIsReady(options.config, options.root, existing, processStates, serviceStates);
      if (existing.state === "ready" && allReady) throw new DevFnError("DEVFN_ALREADY_RUNNING", `DevFn instance ${identity.instanceId} is already running.`);
      // Validate the replacement while the old lifecycle still owns its ports
      // and containers. A malformed source must never turn a ready service off.
      const replacementPlan = createPlan(options.config, options.profile);
      const existingPorts = Object.fromEntries(existing.allocations.map((allocation) => [allocation.service, allocation.port]));
      const replacementPorts = Object.fromEntries(replacementPlan.portNames.map((name) => [name, existingPorts[name] ?? 1]));
      const replacement = await resolveWithComposeNetworks(options.config, replacementPlan, options.root, identity, replacementPorts, loadedPolicy?.policy.hostnameSuffix);
      await startupFingerprints(options.config, options.root, replacement);
      const recovered = await this.cleanup(existing, registry, new ProcessSupervisor(), new ComposeController(), new CaddyProxyController(stateDir), existing.state !== "ready");
      if (recovered.errors.length) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unable to recover interrupted invocation ${existing.invocationId}.`, { cleanup: recovered });
      existing.cleanup = recovered;
      existing.state = "stopped";
      existing.updatedAt = new Date().toISOString();
      await writeReceipt(existing);
    }
  }

  private async startSelectedNode(node: LifecyclePlan["nodes"][number], context: {
    options: UpOptions;
    identity: InstanceIdentity;
    receipt: LifecycleReceipt;
    resolved: ReturnType<typeof resolveEndpointTemplates>;
    ports: Record<string, number>;
    allocations: readonly PortAllocation[];
    supervisor: ProcessSupervisor;
    compose: ComposeController;
  }): Promise<void> {
    const { options, identity, receipt, resolved, ports, allocations, supervisor, compose } = context;
    if (node.kind === "service") {
      const spec = options.config.services![node.name];
      await compose.start({
        name: node.name, spec: { ...spec, env: resolved.nodes[node.name].environment, health: resolvedHealth(spec.health, resolved.nodes[node.name].healthCommand, resolved.nodes[node.name].healthUrl) }, root: options.root, runtimeDir: receipt.runtimeDir, instanceId: identity.instanceId, ports,
        portHosts: Object.fromEntries(allocations.map((item) => [item.service, item.host])),
        portProtocols: Object.fromEntries(allocations.map((item) => [item.service, item.protocol])), environment: resolved.nodes[node.name].environment, readinessEnvironment: resolved.nodes[node.name].readinessEnvironment,
        onStarted: async (managed) => {
          receipt.services.push(managed);
          receipt.startedNodes?.push({ name: node.name, kind: node.kind });
          receipt.updatedAt = new Date().toISOString();
          await writeReceipt(receipt);
        },
      });
      return;
    }
    const spec = options.config.processes![node.name];
    const managed = await supervisor.start({
      name: node.name, spec: { ...spec, env: resolved.nodes[node.name].environment, command: resolved.nodes[node.name].command, script: resolved.nodes[node.name].script, health: resolvedHealth(spec.health, resolved.nodes[node.name].healthCommand, resolved.nodes[node.name].healthUrl) }, root: options.root, runtimeDir: receipt.runtimeDir, ports, environment: resolved.generated,
      onStarted: async (started) => {
        receipt.processes.push(started);
        receipt.startedNodes?.push({ name: node.name, kind: node.kind });
        receipt.updatedAt = new Date().toISOString();
        await writeReceipt(receipt);
      },
    });
    if (spec.exposure !== "public") {
      const expected = (spec.ports ?? []).map((name) => ({ name, port: ports[name], protocol: options.config.ports?.[name]?.protocol ?? "tcp" }));
      await waitForOwnedLoopbackListeners(node.name, expected, managed.pid, spec.health?.timeoutMs ?? 120_000);
    }
  }

  private async cleanup(receipt: LifecycleReceipt, registry: FilePortRegistry, supervisor: ProcessSupervisor, compose: ComposeController, proxy: CaddyProxyController, failed: boolean): Promise<CleanupResult> {
    const result: CleanupResult = { stoppedProcesses: [], stoppedServices: [], removedProxy: false, releasedPorts: false, errors: [] };
    const historical = [
      ...receipt.processes.map((value) => ({ kind: "process" as const, value })),
      ...receipt.services.map((value) => ({ kind: "service" as const, value })),
    ];
    const started = receipt.startedNodes?.length
      ? [...receipt.startedNodes].reverse().flatMap((node) => {
        const found = historical.find((item) => item.kind === node.kind && item.value.name === node.name);
        return found ? [found] : [];
      })
      : historical.sort((a, b) => Date.parse(b.value.startedAt) - Date.parse(a.value.startedAt));
    for (const item of started) {
      try {
        if (item.kind === "process") {
          if (await supervisor.status(item.value) !== "running") continue;
          await supervisor.stop(item.value);
          result.stoppedProcesses.push(item.value.name);
        }
        else { await compose.stop(item.value); result.stoppedServices.push(item.value.name); }
      } catch (error) {
        if (item.kind !== "process" || !error || typeof error !== "object" || !("code" in error) || error.code !== "DEVFN_PROCESS_OWNERSHIP_MISMATCH") {
          result.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    try { await proxy.removeInstance(receipt.instanceId); result.removedProxy = true; } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
    if (result.errors.length === 0) {
      try { await registry.release({ invocationId: receipt.invocationId, ...(failed ? { errorCode: receipt.error?.code ?? "DEVFN_START_FAILED" } : {}) }); result.releasedPorts = true; } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
    }
    return result;
  }

  public async down(options: { config: DevFnConfig; root: string; stateDir?: string }): Promise<LifecycleReceipt> {
    const requestedStateDir = options.stateDir ?? defaultStateDir();
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    await mkdir(requestedStateDir, { recursive: true, mode: 0o700 });
    const stateDir = await realpath(requestedStateDir);
    return await withFileLock(path.join(stateDir, `lifecycle-${identity.instanceId}.lock`), async () => await this.downLocked(options, stateDir, identity), { timeoutMs: 30_000 });
  }

  private async downLocked(options: { config: DevFnConfig; root: string; stateDir?: string }, stateDir: string, identity: InstanceIdentity): Promise<LifecycleReceipt> {
    const receipt = await readReceipt(options.config, options.root, identity.instanceId);
    if (!receipt || receipt.state === "stopped") throw new DevFnError("DEVFN_NOT_RUNNING", `DevFn instance ${identity.instanceId} is not running.`);
    assertReceiptStateDir(receipt, stateDir);
    const cleanup = await this.cleanup(receipt, new FilePortRegistry(path.join(stateDir, "registry.json")), new ProcessSupervisor(), new ComposeController(), new CaddyProxyController(stateDir), false);
    receipt.cleanup = cleanup;
    receipt.state = cleanup.errors.length ? "degraded" : "stopped";
    receipt.updatedAt = new Date().toISOString();
    await writeReceipt(receipt);
    return receipt;
  }

  public async status(options: { config: DevFnConfig; root: string }): Promise<Record<string, unknown>> {
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    const receipt = await readReceipt(options.config, options.root, identity.instanceId);
    if (!receipt) return { ok: true, state: "stopped", instanceId: identity.instanceId, processes: [], services: [], urls: {} };
    const supervisor = new ProcessSupervisor();
    const processes = await Promise.all(receipt.processes.map(async (managed) => ({ name: managed.name, pid: managed.pid, state: await supervisor.status(managed), logPath: managed.logPath })));
    const compose = new ComposeController();
    const services = await Promise.all(receipt.services.map(async (managed) => ({ ...managed, state: await compose.status(managed) })));
    const runtimeReady = receipt.state === "ready" && await receiptIsReady(options.config, options.root, receipt, processes.map((item) => item.state), services.map((item) => item.state));
    const degraded = receipt.state === "ready" && !runtimeReady;
    const state = degraded ? "degraded" : receipt.state;
    return { ok: state !== "failed" && state !== "degraded", state, instanceId: identity.instanceId, profile: receipt.profile, processes, services, allocations: receipt.allocations, urls: state === "ready" ? receipt.urls : {} };
  }

  public async doctor(options: { config: DevFnConfig; root: string; profile?: string; stateDir?: string }): Promise<{ ok: boolean; diagnostics: Array<{ code: string; severity: "error" | "warning" | "info"; message: string; details?: unknown }> }> {
    const diagnostics: Array<{ code: string; severity: "error" | "warning" | "info"; message: string; details?: unknown }> = [];
    const stateDir = options.stateDir ?? defaultStateDir();
    const plan = createPlan(options.config, options.profile);
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 22) diagnostics.push({ code: "DEVFN_NODE_VERSION", severity: "error", message: `Node 22 or newer is required; found ${process.version}.` });
    else diagnostics.push({ code: "DEVFN_NODE_VERSION", severity: "info", message: `Node runtime ${process.version}.` });
    const equivalentRuntimeChecks = new Set<string>();
    for (const requirement of options.config.prerequisites ?? []) {
      if (requirement.profiles && !requirement.profiles.includes(plan.profile)) continue;
      try {
        const executable = requirement.command === "pnpm" ? "corepack" : requirement.command;
        const args = requirement.command === "pnpm" ? ["pnpm", "--version"] : ["--version"];
        const output = await execFileAsync(executable, args, { cwd: options.root, timeout: 5000, env: { ...process.env, ...(requirement.command === "pnpm" ? { COREPACK_ENABLE_NETWORK: "0" } : {}) } });
        const actual = (output.stdout.trim() || output.stderr.trim()).replace(/^v/, "");
        let expected = requirement.version;
        if (expected === "project-pinned") {
          try {
            const packageJson = JSON.parse(await readFile(path.join(options.root, "package.json"), "utf8")) as { packageManager?: string };
            expected = packageJson.packageManager?.startsWith(`${requirement.command}@`) ? packageJson.packageManager.slice(requirement.command.length + 1) : undefined;
          } catch { expected = undefined; }
        }
        if (expected && actual !== expected) diagnostics.push({ code: "DEVFN_PREREQUISITE_VERSION", severity: "error", message: `${requirement.command} ${expected} is required; found ${actual}.` });
        else {
          if (requirement.command === "npm" || requirement.command === "pnpm") equivalentRuntimeChecks.add(requirement.command);
          diagnostics.push({ code: "DEVFN_PREREQUISITE_OK", severity: "info", message: `${requirement.command} is available.`, details: { version: actual, ...(expected ? { expected } : {}) } });
        }
      }
      catch { diagnostics.push({ code: "DEVFN_PREREQUISITE_MISSING", severity: requirement.optional ? "warning" : "error", message: `${requirement.command} is unavailable.` }); }
    }
    const adapters = new Set(plan.nodes.filter((node) => node.kind === "process").map((node) => options.config.processes?.[node.name]?.adapter).filter(Boolean));
    const implicitTools: Array<{ adapter: string; file: string; args: string[] }> = [];
    if (adapters.has("npm")) implicitTools.push({ adapter: "npm", file: "npm", args: ["--version"] });
    if (adapters.has("pnpm")) implicitTools.push({ adapter: "pnpm", file: "corepack", args: ["pnpm", "--version"] });
    if (adapters.has("xcode")) implicitTools.push({ adapter: "xcode", file: "xcodebuild", args: ["-version"] });
    for (const adapter of ["turbo", "wrangler", "extfn"] as const) if (adapters.has(adapter)) implicitTools.push({ adapter, file: "npm", args: ["exec", "--offline", "--", adapter, "--version"] });
    for (const tool of implicitTools) {
      if (equivalentRuntimeChecks.has(tool.adapter)) continue;
      try { await execFileAsync(tool.file, tool.args, { cwd: options.root, timeout: 5000, env: { ...process.env, ...(tool.adapter === "pnpm" ? { COREPACK_ENABLE_NETWORK: "0" } : {}) } }); diagnostics.push({ code: "DEVFN_ADAPTER_AVAILABLE", severity: "info", message: `${tool.adapter} adapter runtime is available.` }); }
      catch { diagnostics.push({ code: "DEVFN_ADAPTER_UNAVAILABLE", severity: "error", message: `${tool.adapter} adapter runtime is unavailable without installation.` }); }
    }
    if (plan.nodes.some((node) => node.kind === "service") && !await new ComposeController().available()) diagnostics.push({ code: "DEVFN_DOCKER_UNAVAILABLE", severity: "error", message: "Docker Compose 2.24.4 or newer is required by this profile." });
    if (plan.proxy && !await new CaddyProxyController(stateDir).available()) diagnostics.push({ code: "DEVFN_CADDY_UNAVAILABLE", severity: "error", message: "Caddy is required by this profile but unavailable." });
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    const registry = await new FilePortRegistry(path.join(stateDir, "registry.json")).reconcile();
    const scan = await scanListenerState(plan.nodes.some((node) => node.kind === "service"));
    const listeners = scan.listeners;
    const unavailableWarnings = new Set<string>();
    const localProcessPorts = new Map<string, "tcp" | "udp">();
    const requiredLocalProtocols = new Set<"tcp" | "udp">();
    for (const node of plan.nodes.filter((candidate) => candidate.kind === "process")) {
      const processSpec = options.config.processes?.[node.name];
      if (!processSpec || processSpec.exposure === "public") continue;
      if (!(processSpec.ports?.length)) {
        requiredLocalProtocols.add("tcp");
        requiredLocalProtocols.add("udp");
      }
      for (const name of processSpec.ports ?? []) {
        const protocol = options.config.ports?.[name]?.protocol ?? "tcp";
        localProcessPorts.set(name, protocol);
        requiredLocalProtocols.add(protocol);
      }
    }
    for (const protocol of requiredLocalProtocols) {
      if (scan.inspection[protocol]) continue;
      const hasRecordedOwner = hasRecordedProcessOwner(registry.allocations, options.config.project.id, identity.instanceId, localProcessPorts, protocol);
      diagnostics.push({
        code: "DEVFN_LISTENER_INSPECTION_UNAVAILABLE",
        severity: hasRecordedOwner ? "warning" : "error",
        message: hasRecordedOwner
          ? `${protocol.toUpperCase()} listener ownership could not be inspected; recorded active owners were retained.`
          : `${protocol.toUpperCase()} listener ownership inspection is required before starting local processes. Install lsof on macOS/Linux or ensure netstat is available on Windows.`,
      });
      unavailableWarnings.add(`${protocol}:os`);
    }
    const exact = plan.portNames.flatMap((name) => options.config.ports?.[name]?.exact && options.config.ports[name].preferred ? [{ name, port: options.config.ports[name].preferred!, protocol: options.config.ports[name].protocol ?? "tcp" as const }] : []);
    for (const item of exact) {
      const allocation = registry.allocations.find((candidate) => candidate.instanceId === identity.instanceId && candidate.service === item.name && candidate.port === item.port && candidate.protocol === item.protocol && candidate.state === "active");
      const matches = listeners.filter((candidate) => candidate.port === item.port && candidate.protocol === item.protocol);
      const relevantListeners = selectOwnershipListeners(allocation, matches);
      const ownership = await Promise.all(relevantListeners.map(async (listener) => {
        if (allocation?.process !== undefined && listener.pid !== undefined) return await isProcessTreeMember(listener.pid, allocation.process.pid);
        return allocation?.container !== undefined && listener.containerId !== undefined && (allocation.container.id.startsWith(listener.containerId) || listener.containerId.startsWith(allocation.container.id));
      }));
      const owned = ownership.length > 0 && ownership.every(Boolean);
      if (owned) continue;
      if (relevantListeners.length === 0 && allocation?.process && !scan.inspection[item.protocol]) {
        const warningKey = `${item.protocol}:os`;
        if (!unavailableWarnings.has(warningKey)) {
          diagnostics.push({ code: "DEVFN_LISTENER_INSPECTION_UNAVAILABLE", severity: "warning", message: `${item.protocol.toUpperCase()} listener ownership could not be inspected; recorded active owners were retained.` });
          unavailableWarnings.add(warningKey);
        }
        continue;
      }
      if (allocation?.container && !scan.inspection.docker) {
        if (!unavailableWarnings.has("docker")) {
          diagnostics.push({ code: "DEVFN_LISTENER_INSPECTION_UNAVAILABLE", severity: "error", message: "Docker listener ownership could not be verified for an active container." });
          unavailableWarnings.add("docker");
        }
        continue;
      }
      if (relevantListeners.length || !await isPortAvailable(item.port, item.protocol)) diagnostics.push({ code: "DEVFN_EXACT_PORT_OCCUPIED", severity: "error", message: `Exact ${item.protocol.toUpperCase()} port ${item.port} for ${item.name} is occupied.`, ...(relevantListeners[0] ? { details: relevantListeners[0] } : {}) });
    }
    const stale = registry.allocations.filter((allocation) => allocation.state === "stale");
    if (stale.length) diagnostics.push({ code: "DEVFN_STALE_LEASES", severity: "warning", message: `${stale.length} stale lease(s) need garbage collection.` });
    return { ok: diagnostics.every((item) => item.severity !== "error"), diagnostics };
  }

  public async logs(options: { config: DevFnConfig; root: string; name?: string; tail?: number }): Promise<Record<string, string>> {
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    const receipt = await readReceipt(options.config, options.root, identity.instanceId);
    if (!receipt) throw new DevFnError("DEVFN_NOT_RUNNING", "No runtime receipt exists for this worktree.");
    const output: Record<string, string> = {};
    const redact = (value: string, keys: readonly string[] = []) => keys.reduce((result, key) => process.env[key] ? result.split(process.env[key]!).join("[REDACTED]") : result, value);
    for (const managed of receipt.processes.filter((item) => !options.name || item.name === options.name)) {
      const lines = (await readFile(managed.logPath, "utf8").catch(() => "")).split("\n");
      const tail = options.tail ?? 200;
      output[managed.name] = redact(tail === 0 ? "" : lines.slice(-tail).join("\n"), options.config.processes?.[managed.name]?.secretEnv);
    }
    const compose = new ComposeController();
    for (const service of receipt.services.filter((item) => !options.name || item.name === options.name)) {
      const currentSpec = options.config.services?.[service.name];
      const effective = { ...service, logsDisabled: Boolean(service.logsDisabled || currentSpec?.secretEnv?.length) };
      output[service.name] = redact(await compose.logs(effective, options.tail), currentSpec?.secretEnv);
    }
    return output;
  }
}
