import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveContainedPath, type ComposeServiceSpec } from "@devfn/config";
import { waitForReadiness } from "@devfn/processes";

const execFileAsync = promisify(execFile);
const MINIMUM_COMPOSE_VERSION = [2, 24, 4] as const;

export interface ManagedComposeService {
  name: string;
  composeService: string;
  projectName: string;
  files: string[];
  containerIds: string[];
  preExisting: boolean;
  wasRunning: boolean;
  startedContainerIds?: string[];
  createdContainerIds?: string[];
  startedAt: string;
  logsDisabled?: boolean;
  dockerEnvironment?: Record<string, string>;
}

function lifecycleOwnership(output: string, count: number, instanceId: string, lifecycleName: string): Array<"current" | "other" | "unmanaged"> | null {
  const rows = output.split("\n").filter(Boolean).map((line) => line.split("\t"));
  if (rows.length !== count) return null;
  return rows.map(([managed, instance, lifecycle]) => managed === "true" ? (instance === instanceId && lifecycle === lifecycleName ? "current" : "other") : "unmanaged");
}

export interface ComposeStartInput {
  name: string;
  spec: ComposeServiceSpec;
  root: string;
  runtimeDir: string;
  instanceId: string;
  ports: Record<string, number>;
  portHosts?: Record<string, string>;
  portProtocols?: Record<string, "tcp" | "udp">;
  environment?: Record<string, string>;
  onStarted?: (service: ManagedComposeService) => Promise<void>;
}

export class ComposeError extends Error {
  public constructor(public readonly code: "DEVFN_COMPOSE_UNAVAILABLE" | "DEVFN_COMPOSE_START_FAILED" | "DEVFN_COMPOSE_STOP_FAILED", message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ComposeError";
  }
}

function safeProjectName(prefix: string, instanceId: string): string {
  const suffix = instanceId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 20);
  const available = Math.max(1, 48 - suffix.length - 1);
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, available);
  return `${safePrefix}-${suffix}`;
}

export function createComposeEnvironment(spec: ComposeServiceSpec, generated: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const base = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "XDG_RUNTIME_DIR", "SystemRoot", "ComSpec", "PATHEXT"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [...base, ...(spec.envAllowlist ?? [])]) if (source[key] !== undefined) environment[key] = source[key];
  return { ...environment, ...(spec.env ?? {}), ...generated };
}

const DOCKER_ENVIRONMENT_KEYS = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"] as const;

function persistedDockerEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(DOCKER_ENVIRONMENT_KEYS.flatMap((key) => environment[key] === undefined ? [] : [[key, environment[key]!]]));
}

function directDockerEnvironment(persisted?: Record<string, string>): NodeJS.ProcessEnv {
  const environment = createComposeEnvironment({ adapter: "compose", service: "docker" });
  if (persisted !== undefined) for (const key of DOCKER_ENVIRONMENT_KEYS) delete environment[key];
  return { ...environment, ...(persisted ?? {}) };
}

function supportedComposeVersion(output: string): boolean {
  const match = output.match(/(?:^|\D)(\d+)\.(\d+)\.(\d+)(?:\D|$)/);
  if (!match) return false;
  const actual = match.slice(1, 4).map(Number);
  for (let index = 0; index < MINIMUM_COMPOSE_VERSION.length; index += 1) {
    if (actual[index] !== MINIMUM_COMPOSE_VERSION[index]) return actual[index] > MINIMUM_COMPOSE_VERSION[index];
  }
  return true;
}

function dockerContainerMissing(error: unknown): boolean {
  const candidate = error as { message?: unknown; stderr?: unknown };
  const detail = `${typeof candidate.stderr === "string" ? candidate.stderr : ""}\n${typeof candidate.message === "string" ? candidate.message : ""}`;
  return /no such (?:object|container)/i.test(detail);
}

export function renderComposeOverride(spec: ComposeServiceSpec, ports: Record<string, number>, hosts: Record<string, string> = {}, protocols: Record<string, "tcp" | "udp"> = {}, metadata?: { instanceId: string; lifecycleName: string }): string {
  const mappings = Object.entries(spec.ports ?? {}).map(([name, internal]) => {
    const host = ports[name];
    if (!host) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Missing allocation ${name} for Compose service ${spec.service}.`);
    return `      - "${hosts[name] ?? "127.0.0.1"}:${host}:${internal}${protocols[name] === "udp" ? "/udp" : ""}"`;
  });
  const logging = spec.secretEnv?.length ? ["    logging:", "      driver: none"] : [];
  const labels = metadata ? ["    labels:", '      devfn.managed: "true"', `      devfn.instance: ${JSON.stringify(metadata.instanceId)}`, `      devfn.lifecycle: ${JSON.stringify(metadata.lifecycleName)}`] : [];
  return ["services:", `  ${spec.service}:`, ...(mappings.length ? ["    ports: !override", ...mappings] : []), ...logging, ...labels, ...(!mappings.length && !logging.length && !labels.length ? ["    {}"] : []), ""].join("\n");
}

export class ComposeController {
  public constructor(private readonly run = execFileAsync) {}

  public async available(cwd?: string, environment?: NodeJS.ProcessEnv): Promise<boolean> {
    try {
      const { stdout, stderr } = await this.run("docker", ["compose", "version", "--short"], { ...(cwd ? { cwd } : {}), ...(environment ? { env: environment } : {}), timeout: 5000 });
      return supportedComposeVersion(`${stdout}${stderr}`);
    } catch { return false; }
  }

  public async start(input: ComposeStartInput): Promise<ManagedComposeService> {
    if (!/^[A-Za-z0-9_.-]+$/.test(input.name) || input.name !== input.name.trim()) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose lifecycle name ${input.name} contains unsupported characters.`);
    const environment = createComposeEnvironment(input.spec, input.environment);
    const dockerEnvironment = persistedDockerEnvironment(environment);
    if (!await this.available(input.root, environment)) throw new ComposeError("DEVFN_COMPOSE_UNAVAILABLE", "Docker Compose 2.24.4 or newer is required.");
    const projectName = safeProjectName(input.spec.projectName ?? "devfn", input.instanceId);
    const sourceFile = await resolveContainedPath(input.root, input.spec.file ?? "compose.yaml", `services.${input.name}.file`);
    const overrideDir = path.join(input.runtimeDir, "compose");
    await mkdir(overrideDir, { recursive: true, mode: 0o700 });
    const overrideFile = await resolveContainedPath(input.runtimeDir, path.join("compose", `${input.name}.override.yaml`), `services.${input.name}`);
    if (input.spec.secretEnv?.length && input.spec.health?.type === "log") throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${input.name} cannot use log readiness while secret-bearing logs are disabled.`);
    await writeFile(overrideFile, renderComposeOverride(input.spec, input.ports, input.portHosts, input.portProtocols, { instanceId: input.instanceId, lifecycleName: input.name }), { encoding: "utf8", mode: 0o600 });
    const files = [sourceFile, overrideFile];
    const baseArgs = ["compose", "-p", projectName, ...files.flatMap((file) => ["-f", file])];
    const before = await this.containerIds(baseArgs, input.spec.service, input.root, environment, true);
    const beforeRunning = await this.containerIds(baseArgs, input.spec.service, input.root, environment, false);
    let reclaimManaged = false;
    if (before.length > 0) {
      try {
        const labels = (await this.run("docker", ["inspect", "--format", "{{ index .Config.Labels \"devfn.managed\" }}\t{{ index .Config.Labels \"devfn.instance\" }}\t{{ index .Config.Labels \"devfn.lifecycle\" }}", ...before], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout;
        const ownership = lifecycleOwnership(labels, before.length, input.instanceId, input.name);
        if (!ownership) throw new Error("Docker returned incomplete ownership labels.");
        if (ownership.includes("other")) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${input.name} contains containers managed by another DevFn lifecycle; refusing to mutate them.`);
        reclaimManaged = ownership.every((owner) => owner === "current");
      } catch (error) {
        if (error instanceof ComposeError) throw error;
        throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inspect ownership for pre-existing Compose service ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) });
      }
    }
    const preservePreExisting = before.length > 0 && !reclaimManaged;
    const preExistingIds = new Set(before);
    const previouslyRunning = new Set(beforeRunning);
    if (input.spec.secretEnv?.length && before.length) {
      try {
        const drivers = (await this.run("docker", ["inspect", "--format", "{{.HostConfig.LogConfig.Type}}", ...before], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.split(/\s+/).filter(Boolean);
        if (drivers.some((driver) => driver !== "none")) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} persists logs; refusing to expose secret-bearing output.`);
      } catch (error) {
        if (error instanceof ComposeError) throw error;
        throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inspect pre-existing Compose service ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) });
      }
    }
    let containerIds: string[] = [];
    const startedAt = new Date().toISOString();
    try {
      await this.run("docker", [...baseArgs, "up", "-d", ...(preservePreExisting ? ["--no-recreate"] : []), "--no-deps", input.spec.service], { cwd: input.root, env: environment, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      containerIds = await this.containerIds(baseArgs, input.spec.service, input.root, environment, true);
      if (containerIds.length === 0) throw new Error("Compose returned no container IDs.");
      const startedContainerIds = preservePreExisting ? containerIds.filter((id) => preExistingIds.has(id) && !previouslyRunning.has(id)) : containerIds;
      const createdContainerIds = preservePreExisting ? containerIds.filter((id) => !preExistingIds.has(id)) : containerIds;
      const managed = { name: input.name, composeService: input.spec.service, projectName, files, containerIds, preExisting: preservePreExisting, wasRunning: preservePreExisting && startedContainerIds.length === 0, startedContainerIds, createdContainerIds, startedAt, logsDisabled: Boolean(input.spec.secretEnv?.length), dockerEnvironment };
      await input.onStarted?.(managed);
      await waitForReadiness({
        health: input.spec.health, ports: input.ports, logPath: overrideFile, cwd: input.root, environment,
        isAlive: async () => await this.status(managed) === "running",
        readLog: async () => await this.logs(managed, 1000, managed.startedAt),
      });
      return managed;
    } catch (error) {
      const cleanupIds = containerIds.length ? containerIds : (preservePreExisting ? before : []);
      const startedContainerIds = preservePreExisting ? cleanupIds.filter((id) => preExistingIds.has(id) && !previouslyRunning.has(id)) : cleanupIds;
      const createdContainerIds = preservePreExisting ? cleanupIds.filter((id) => !preExistingIds.has(id)) : cleanupIds;
      const failed = { name: input.name, composeService: input.spec.service, projectName, files, containerIds: cleanupIds, preExisting: preservePreExisting, wasRunning: preservePreExisting && startedContainerIds.length === 0, startedContainerIds, createdContainerIds, startedAt, dockerEnvironment };
      if (cleanupIds.length) await this.stop(failed).catch(() => undefined);
      else await this.stopWithCompose(failed, input.root, environment).catch(() => undefined);
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to start Compose service ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async containerIds(baseArgs: string[], service: string, cwd: string, environment: NodeJS.ProcessEnv, all = false): Promise<string[]> {
    try { return (await this.run("docker", [...baseArgs, "ps", ...(all ? ["-a"] : []), "-q", service], { cwd, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.split(/\s+/).filter(Boolean); }
    catch (error) { throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to query Compose service ${service}.`, { cause: error instanceof Error ? error.message : String(error) }); }
  }

  private async stopWithCompose(service: ManagedComposeService, cwd: string, environment: NodeJS.ProcessEnv): Promise<void> {
    if (service.preExisting) return;
    const baseArgs = ["compose", "-p", service.projectName, ...service.files.flatMap((file) => ["-f", file])];
    await this.run("docker", [...baseArgs, "stop", service.composeService], { cwd, env: environment, timeout: 30_000, maxBuffer: 1024 * 1024 });
    if (!service.preExisting) await this.run("docker", [...baseArgs, "rm", "-f", service.composeService], { cwd, env: environment, timeout: 30_000, maxBuffer: 1024 * 1024 });
  }

  private async applyContainerAction(action: string[], ids: string[], environment: NodeJS.ProcessEnv): Promise<void> {
    if (ids.length === 0) return;
    const options = { env: environment, timeout: 30_000, maxBuffer: 1024 * 1024 };
    try { await this.run("docker", [...action, ...ids], options); }
    catch (error) {
      if (!dockerContainerMissing(error)) throw error;
      for (const id of ids) {
        try { await this.run("docker", [...action, id], options); }
        catch (retryError) { if (!dockerContainerMissing(retryError)) throw retryError; }
      }
    }
  }

  public async stop(service: ManagedComposeService): Promise<void> {
    const startedContainerIds = service.preExisting ? (service.startedContainerIds ?? (service.wasRunning ? [] : service.containerIds)) : service.containerIds;
    const createdContainerIds = service.preExisting ? (service.createdContainerIds ?? []) : service.containerIds;
    const stopIds = [...new Set([...startedContainerIds, ...createdContainerIds])];
    if (stopIds.length === 0) return;
    try {
      const environment = directDockerEnvironment(service.dockerEnvironment);
      await this.applyContainerAction(["stop"], stopIds, environment);
      await this.applyContainerAction(["rm", "-f"], createdContainerIds, environment);
    } catch (error) {
      throw new ComposeError("DEVFN_COMPOSE_STOP_FAILED", `Unable to stop Compose service ${service.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  public async logs(service: ManagedComposeService, tail: number | null = 200, since?: string): Promise<string> {
    if (service.logsDisabled) return "";
    const environment = directDockerEnvironment(service.dockerEnvironment);
    const outputs = await Promise.all(service.containerIds.map(async (id) => {
      const { stdout, stderr } = await this.run("docker", ["logs", ...(since ? ["--since", since] : []), ...(tail === null ? [] : ["--tail", String(tail)]), id], { env: environment, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 });
      return `${stdout}${stderr}`;
    }));
    return outputs.join("\n");
  }

  public async status(service: ManagedComposeService): Promise<"running" | "stopped"> {
    if (service.containerIds.length === 0) return "stopped";
    try {
      const { stdout } = await this.run("docker", ["inspect", "--format", "{{.State.Running}}", ...service.containerIds], { env: directDockerEnvironment(service.dockerEnvironment), timeout: 10_000, maxBuffer: 1024 * 1024 });
      return stdout.split(/\s+/).filter(Boolean).every((value) => value === "true") ? "running" : "stopped";
    } catch { return "stopped"; }
  }
}
