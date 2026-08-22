import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ComposeController, type ManagedComposeService } from "@devfn/compose";
import { defaultStateDir, loadDevFnPolicy, type DevFnConfig } from "@devfn/config";
import { FilePortRegistry, isPortAvailable, resolvePolicy, scanListeners, withFileLock, type PortAllocation } from "@devfn/ports";
import { ProcessSupervisor, type ManagedProcess } from "@devfn/processes";
import { CaddyProxyController, type ProxyRoute } from "@devfn/proxy";

import { resolveInstanceIdentity } from "./identity.js";
import { createPlan } from "./planner.js";
import { readReceipt, secureRuntimeDirectory, writeEnvironmentOutputs, writeReceipt } from "./runtime.js";
import { DevFnError, type CleanupResult, type InstanceIdentity, type LifecycleReceipt, type UpOptions } from "./types.js";

const execFileAsync = promisify(execFile);

function envName(name: string): string { return `DEVFN_PORT_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`; }
function hostname(configured: string | undefined, key: string, projectId: string, instanceId: string, suffix = ".localhost"): string {
  const result = (configured ?? `${key}-{instance}${suffix}`).replaceAll("{instance}", instanceId).replaceAll("{project}", projectId);
  if (!result.endsWith(".localhost")) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Local hostname ${result} must end in .localhost.`);
  return result;
}

export class DevFnOrchestrator {
  public async up(options: UpOptions): Promise<LifecycleReceipt> {
    const stateDir = options.stateDir ?? defaultStateDir();
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(path.join(stateDir, `lifecycle-${identity.instanceId}.lock`), async () => await this.upLocked(options, stateDir, identity), { timeoutMs: 30_000 });
  }

  private async upLocked(options: UpOptions, stateDir: string, identity: InstanceIdentity): Promise<LifecycleReceipt> {
    const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
    const existing = await readReceipt(options.config, options.root, identity.instanceId);
    if (existing && existing.state !== "stopped") {
      const processRunning = (await Promise.all(existing.processes.map((item) => new ProcessSupervisor().status(item)))).some((state) => state === "running");
      const serviceRunning = (await Promise.all(existing.services.map((item) => new ComposeController().status(item)))).some((state) => state === "running");
      if (existing.state === "ready" && (processRunning || serviceRunning)) throw new DevFnError("DEVFN_ALREADY_RUNNING", `DevFn instance ${identity.instanceId} is already running.`);
      if (processRunning || serviceRunning || existing.state === "starting" || existing.state === "degraded") {
        const recovered = await this.cleanup(existing, registry, new ProcessSupervisor(), new ComposeController(), new CaddyProxyController(stateDir), existing.state !== "ready");
        if (recovered.errors.length) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unable to recover interrupted invocation ${existing.invocationId}.`, { cleanup: recovered });
        existing.cleanup = recovered;
        existing.state = "stopped";
        existing.updatedAt = new Date().toISOString();
        await writeReceipt(existing);
      } else await registry.release({ invocationId: existing.invocationId });
    }
    const plan = createPlan(options.config, options.profile);
    const publicNodes = plan.nodes.filter((node) => node.kind === "process" && options.config.processes?.[node.name]?.exposure === "public").map((node) => node.name);
    const publicPorts = plan.portNames.filter((name) => options.config.ports?.[name]?.exposure === "public");
    if ((publicNodes.length || publicPorts.length) && !options.allowPublic) {
      throw new DevFnError("DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED", "This profile declares public exposure. Review it and rerun with --allow-public.", { processes: publicNodes, ports: publicPorts });
    }
    const invocationId = randomUUID();
    const runtimeDir = await secureRuntimeDirectory(options.config, options.root, identity.instanceId);
    const loadedPolicy = await loadDevFnPolicy(options.root, options.config.policy);
    const policy = resolvePolicy(loadedPolicy?.policy ?? null, options.config.project.id);
    const suffix = loadedPolicy?.policy.hostnameSuffix ?? ".localhost";
    const profileHostnames = Object.entries(options.config.hostnames ?? {}).filter(([, spec]) => !spec.profiles || spec.profiles.includes(plan.profile));
    const configuredHostnames = Object.fromEntries(profileHostnames.map(([name, spec]) => [spec.target, hostname(spec.hostname, name, options.config.project.id, identity.instanceId, suffix)]));
    const allocations = await registry.reserve({
      projectId: options.config.project.id,
      instanceId: identity.instanceId,
      invocationId,
      profile: plan.profile,
      requests: plan.portNames.map((name) => ({ name, spec: options.config.ports?.[name] ?? {}, ...(configuredHostnames[name] ? { hostname: configuredHostnames[name] } : {}) })),
      ...policy,
    });
    const ports = Object.fromEntries(allocations.map((item) => [item.service, item.port]));
    const profileEnvironment = options.config.profiles[plan.profile].environment ?? {};
    const environment: Record<string, string> = { ...profileEnvironment, DEVFN_PROJECT_ID: options.config.project.id, DEVFN_INSTANCE_ID: identity.instanceId, DEVFN_PROFILE: plan.profile };
    for (const allocation of allocations) {
      environment[envName(allocation.service)] = String(allocation.port);
      const configured = options.config.ports?.[allocation.service]?.env;
      if (configured) environment[configured] = String(allocation.port);
    }
    const receipt: LifecycleReceipt = {
      version: 1, projectId: options.config.project.id, instanceId: identity.instanceId, invocationId, profile: plan.profile,
      state: "starting", root: options.root, runtimeDir, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      allocations, processes: [], services: [], startedNodes: [], routes: [], urls: {}, environmentOutputs: [],
    };
    try {
      await registry.updateInvocation(invocationId, { state: "starting" });
      await writeReceipt(receipt);
    } catch (error) {
      await registry.release({ invocationId, errorCode: "DEVFN_RECEIPT_WRITE_FAILED" }).catch(() => undefined);
      throw error;
    }
    const supervisor = new ProcessSupervisor();
    const compose = new ComposeController();
    const proxy = new CaddyProxyController(stateDir);
    try {
      receipt.environmentOutputs = await writeEnvironmentOutputs(options.root, runtimeDir, options.config.environmentOutputs ?? [], environment);
      for (const node of plan.nodes) {
        if (node.kind === "service") {
          receipt.services.push(await compose.start({
            name: node.name, spec: options.config.services![node.name], root: options.root, runtimeDir, instanceId: identity.instanceId, ports,
            portHosts: Object.fromEntries(allocations.map((item) => [item.service, item.host])),
            portProtocols: Object.fromEntries(allocations.map((item) => [item.service, item.protocol])), environment,
          }));
        } else {
          receipt.processes.push(await supervisor.start({ name: node.name, spec: options.config.processes![node.name], root: options.root, runtimeDir, ports, environment }));
          if (options.config.processes![node.name].exposure !== "public") {
            const expected = new Set(options.config.processes![node.name].ports?.map((name) => ports[name]) ?? []);
            const unsafe = (await scanListeners()).find((listener) => expected.has(listener.port) && ["*", "0.0.0.0", "::", "[::]"].includes(listener.host));
            if (unsafe) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Process ${node.name} exposed port ${unsafe.port} beyond loopback.`);
          }
        }
        receipt.startedNodes?.push({ name: node.name, kind: node.kind });
        receipt.updatedAt = new Date().toISOString();
        await writeReceipt(receipt);
      }
      if (plan.proxy) {
        const routes = profileHostnames.map(([name, spec]) => ({
          id: `${identity.instanceId}:${name}`, instanceId: identity.instanceId,
          hostname: hostname(spec.hostname, name, options.config.project.id, identity.instanceId, suffix), targetHost: "127.0.0.1", targetPort: ports[spec.target], tls: spec.tls ?? "off",
        }));
        receipt.routes = await proxy.upsert(routes);
      }
      const httpPorts = new Set<string>(profileHostnames.map(([, spec]) => spec.target));
      for (const process of Object.values(options.config.processes ?? {})) if (process.health?.type === "http" && process.health.port) httpPorts.add(process.health.port);
      for (const service of Object.values(options.config.services ?? {})) if (service.health?.type === "http" && service.health.port) httpPorts.add(service.health.port);
      for (const allocation of allocations) {
        const route = receipt.routes.find((item) => item.targetPort === allocation.port);
        if (route) receipt.urls[allocation.service] = `${route.tls === "internal" ? "https" : "http"}://${route.hostname}`;
        else if (httpPorts.has(allocation.service)) receipt.urls[allocation.service] = `http://127.0.0.1:${allocation.port}`;
      }
      const owners: Record<string, { process?: PortAllocation["process"]; container?: PortAllocation["container"] }> = {};
      for (const process of receipt.processes) for (const name of options.config.processes?.[process.name]?.ports ?? []) owners[name] = { process: { pid: process.pid, ...(process.birthSignature ? { birthSignature: process.birthSignature } : {}) } };
      for (const service of receipt.services) for (const name of Object.keys(options.config.services?.[service.name]?.ports ?? {})) owners[name] = { container: { id: service.containerIds[0], name: service.composeService } };
      await registry.markActive(invocationId, owners);
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
        if (item.kind === "process") { await supervisor.stop(item.value); result.stoppedProcesses.push(item.value.name); }
        else { await compose.stop(item.value); result.stoppedServices.push(item.value.name); }
      } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
    }
    try { await proxy.removeInstance(receipt.instanceId); result.removedProxy = true; } catch (error) { if (receipt.routes.length) result.errors.push(error instanceof Error ? error.message : String(error)); }
    if (result.errors.length === 0) {
      try { await registry.release({ invocationId: receipt.invocationId, ...(failed ? { errorCode: receipt.error?.code ?? "DEVFN_START_FAILED" } : {}) }); result.releasedPorts = true; } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
    }
    return result;
  }

  public async down(options: { config: DevFnConfig; root: string; stateDir?: string }): Promise<LifecycleReceipt> {
    const stateDir = options.stateDir ?? defaultStateDir();
    const identity = await resolveInstanceIdentity(options.config.project.id, options.root);
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    return await withFileLock(path.join(stateDir, `lifecycle-${identity.instanceId}.lock`), async () => await this.downLocked(options, stateDir, identity), { timeoutMs: 30_000 });
  }

  private async downLocked(options: { config: DevFnConfig; root: string; stateDir?: string }, stateDir: string, identity: InstanceIdentity): Promise<LifecycleReceipt> {
    const receipt = await readReceipt(options.config, options.root, identity.instanceId);
    if (!receipt || receipt.state === "stopped") throw new DevFnError("DEVFN_NOT_RUNNING", `DevFn instance ${identity.instanceId} is not running.`);
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
    const degraded = (processes.some((item) => item.state !== "running") || services.some((item) => item.state !== "running")) && receipt.state === "ready";
    return { ok: !degraded, state: degraded ? "degraded" : receipt.state, instanceId: identity.instanceId, profile: receipt.profile, processes, services, allocations: receipt.allocations, urls: receipt.urls };
  }

  public async doctor(options: { config: DevFnConfig; root: string; profile?: string; stateDir?: string }): Promise<{ ok: boolean; diagnostics: Array<{ code: string; severity: "error" | "warning" | "info"; message: string; details?: unknown }> }> {
    const diagnostics: Array<{ code: string; severity: "error" | "warning" | "info"; message: string; details?: unknown }> = [];
    const plan = createPlan(options.config, options.profile);
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 22) diagnostics.push({ code: "DEVFN_NODE_VERSION", severity: "error", message: `Node 22 or newer is required; found ${process.version}.` });
    else diagnostics.push({ code: "DEVFN_NODE_VERSION", severity: "info", message: `Node runtime ${process.version}.` });
    for (const requirement of options.config.prerequisites ?? []) {
      if (requirement.profiles && !requirement.profiles.includes(plan.profile)) continue;
      try {
        const output = await execFileAsync(requirement.command, ["--version"], { timeout: 5000 });
        const actual = (output.stdout.trim() || output.stderr.trim()).replace(/^v/, "");
        let expected = requirement.version;
        if (expected === "project-pinned") {
          try {
            const packageJson = JSON.parse(await readFile(path.join(options.root, "package.json"), "utf8")) as { packageManager?: string };
            expected = packageJson.packageManager?.startsWith(`${requirement.command}@`) ? packageJson.packageManager.slice(requirement.command.length + 1) : undefined;
          } catch { expected = undefined; }
        }
        if (expected && actual !== expected) diagnostics.push({ code: "DEVFN_PREREQUISITE_VERSION", severity: "error", message: `${requirement.command} ${expected} is required; found ${actual}.` });
        else diagnostics.push({ code: "DEVFN_PREREQUISITE_OK", severity: "info", message: `${requirement.command} is available.`, details: { version: actual, ...(expected ? { expected } : {}) } });
      }
      catch { diagnostics.push({ code: "DEVFN_PREREQUISITE_MISSING", severity: requirement.optional ? "warning" : "error", message: `${requirement.command} is unavailable.` }); }
    }
    const adapters = new Set(plan.nodes.filter((node) => node.kind === "process").map((node) => options.config.processes?.[node.name]?.adapter).filter(Boolean));
    const implicitTools: Array<{ adapter: string; file: string; args: string[] }> = [];
    if (adapters.has("npm")) implicitTools.push({ adapter: "npm", file: "npm", args: ["--version"] });
    if (adapters.has("pnpm")) implicitTools.push({ adapter: "pnpm", file: "pnpm", args: ["--version"] });
    if (adapters.has("xcode")) implicitTools.push({ adapter: "xcode", file: "xcodebuild", args: ["-version"] });
    for (const adapter of ["turbo", "wrangler", "extfn"] as const) if (adapters.has(adapter)) implicitTools.push({ adapter, file: "npm", args: ["exec", "--offline", "--", adapter, "--version"] });
    for (const tool of implicitTools) {
      if (diagnostics.some((item) => item.code === "DEVFN_PREREQUISITE_OK" && item.message.startsWith(`${tool.file} `))) continue;
      try { await execFileAsync(tool.file, tool.args, { cwd: options.root, timeout: 5000 }); diagnostics.push({ code: "DEVFN_ADAPTER_AVAILABLE", severity: "info", message: `${tool.adapter} adapter runtime is available.` }); }
      catch { diagnostics.push({ code: "DEVFN_ADAPTER_UNAVAILABLE", severity: "error", message: `${tool.adapter} adapter runtime is unavailable without installation.` }); }
    }
    if (plan.nodes.some((node) => node.kind === "service") && !await new ComposeController().available()) diagnostics.push({ code: "DEVFN_DOCKER_UNAVAILABLE", severity: "error", message: "Docker Compose is required by this profile but unavailable." });
    if (plan.proxy && !await new CaddyProxyController(options.stateDir ?? defaultStateDir()).available()) diagnostics.push({ code: "DEVFN_CADDY_UNAVAILABLE", severity: "error", message: "Caddy is required by this profile but unavailable." });
    const listeners = await scanListeners();
    const exact = plan.portNames.flatMap((name) => options.config.ports?.[name]?.exact && options.config.ports[name].preferred ? [{ name, port: options.config.ports[name].preferred! }] : []);
    for (const item of exact) {
      const listener = listeners.find((candidate) => candidate.port === item.port);
      if (listener || !await isPortAvailable(item.port, options.config.ports?.[item.name]?.protocol)) diagnostics.push({ code: "DEVFN_EXACT_PORT_OCCUPIED", severity: "error", message: `Exact port ${item.port} for ${item.name} is occupied.`, ...(listener ? { details: listener } : {}) });
    }
    const registry = await new FilePortRegistry(path.join(options.stateDir ?? defaultStateDir(), "registry.json")).reconcile();
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
      output[managed.name] = redact(lines.slice(-(options.tail ?? 200)).join("\n"), options.config.processes?.[managed.name]?.secretEnv);
    }
    const compose = new ComposeController();
    for (const service of receipt.services.filter((item) => !options.name || item.name === options.name)) output[service.name] = redact(await compose.logs(service, options.tail), options.config.services?.[service.name]?.secretEnv);
    return output;
  }
}
