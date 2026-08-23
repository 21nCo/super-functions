import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveContainedPath, type ComposeServiceSpec } from "@devfn/config";
import { waitForReadiness } from "@devfn/processes";

const execFileAsync = promisify(execFile);

export interface ManagedComposeService {
  name: string;
  composeService: string;
  projectName: string;
  files: string[];
  containerIds: string[];
  preExisting: boolean;
  wasRunning: boolean;
  startedAt: string;
  logsDisabled?: boolean;
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

function composeEnvironment(spec: ComposeServiceSpec, generated: Record<string, string> = {}): NodeJS.ProcessEnv {
  const base = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "XDG_RUNTIME_DIR", "SystemRoot", "ComSpec", "PATHEXT"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [...base, ...(spec.envAllowlist ?? [])]) if (process.env[key] !== undefined) environment[key] = process.env[key];
  return { ...environment, ...generated, ...(spec.env ?? {}) };
}

export function renderComposeOverride(spec: ComposeServiceSpec, ports: Record<string, number>, hosts: Record<string, string> = {}, protocols: Record<string, "tcp" | "udp"> = {}): string {
  const mappings = Object.entries(spec.ports ?? {}).map(([name, internal]) => {
    const host = ports[name];
    if (!host) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Missing allocation ${name} for Compose service ${spec.service}.`);
    return `      - "${hosts[name] ?? "127.0.0.1"}:${host}:${internal}${protocols[name] === "udp" ? "/udp" : ""}"`;
  });
  const logging = spec.secretEnv?.length ? ["    logging:", "      driver: none"] : [];
  return ["services:", `  ${spec.service}:`, ...(mappings.length ? ["    ports:", ...mappings] : []), ...logging, ...(!mappings.length && !logging.length ? ["    {}"] : []), ""].join("\n");
}

export class ComposeController {
  public constructor(private readonly run = execFileAsync) {}

  public async available(): Promise<boolean> {
    try { await this.run("docker", ["compose", "version"], { timeout: 5000 }); return true; } catch { return false; }
  }

  public async start(input: ComposeStartInput): Promise<ManagedComposeService> {
    if (!await this.available()) throw new ComposeError("DEVFN_COMPOSE_UNAVAILABLE", "Docker Compose is unavailable.");
    const projectName = safeProjectName(input.spec.projectName ?? "devfn", input.instanceId);
    const sourceFile = await resolveContainedPath(input.root, input.spec.file ?? "compose.yaml", `services.${input.name}.file`);
    const overrideDir = path.join(input.runtimeDir, "compose");
    await mkdir(overrideDir, { recursive: true, mode: 0o700 });
    const overrideFile = path.join(overrideDir, `${input.name}.override.yaml`);
    if (input.spec.secretEnv?.length && input.spec.health?.type === "log") throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${input.name} cannot use log readiness while secret-bearing logs are disabled.`);
    await writeFile(overrideFile, renderComposeOverride(input.spec, input.ports, input.portHosts, input.portProtocols), { encoding: "utf8", mode: 0o600 });
    const files = [sourceFile, overrideFile];
    const baseArgs = ["compose", "-p", projectName, ...files.flatMap((file) => ["-f", file])];
    const before = await this.containerIds(baseArgs, input.spec.service, true);
    const beforeRunning = await this.containerIds(baseArgs, input.spec.service, false);
    if (input.spec.secretEnv?.length && before.length) {
      const drivers = (await this.run("docker", ["inspect", "--format", "{{.HostConfig.LogConfig.Type}}", ...before], { timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.split(/\s+/).filter(Boolean);
      if (drivers.some((driver) => driver !== "none")) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} persists logs; refusing to expose secret-bearing output.`);
    }
    const environment = composeEnvironment(input.spec, input.environment);
    try {
      await this.run("docker", [...baseArgs, "up", "-d", "--no-recreate", "--no-deps", input.spec.service], { cwd: input.root, env: environment, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      const containerIds = await this.containerIds(baseArgs, input.spec.service);
      if (containerIds.length === 0) throw new Error("Compose returned no container IDs.");
      const managed = { name: input.name, composeService: input.spec.service, projectName, files, containerIds, preExisting: before.length > 0, wasRunning: beforeRunning.length > 0, startedAt: new Date().toISOString(), logsDisabled: Boolean(input.spec.secretEnv?.length) };
      await input.onStarted?.(managed);
      await waitForReadiness({
        health: input.spec.health, ports: input.ports, logPath: overrideFile, cwd: input.root, environment,
        isAlive: async () => await this.status(managed) === "running",
        readLog: async () => await this.logs(managed, null),
      });
      return managed;
    } catch (error) {
      await this.stop({ name: input.name, composeService: input.spec.service, projectName, files, containerIds: [], preExisting: before.length > 0, wasRunning: beforeRunning.length > 0, startedAt: new Date().toISOString() }).catch(() => undefined);
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to start Compose service ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async containerIds(baseArgs: string[], service: string, all = false): Promise<string[]> {
    try { return (await this.run("docker", [...baseArgs, "ps", ...(all ? ["-a"] : []), "-q", service], { timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.split(/\s+/).filter(Boolean); } catch { return []; }
  }

  public async stop(service: ManagedComposeService): Promise<void> {
    if (service.preExisting && service.wasRunning) return;
    const baseArgs = ["compose", "-p", service.projectName, ...service.files.flatMap((file) => ["-f", file])];
    try {
      await this.run("docker", [...baseArgs, "stop", service.composeService], { timeout: 30_000, maxBuffer: 1024 * 1024 });
      if (!service.preExisting) await this.run("docker", [...baseArgs, "rm", "-f", service.composeService], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      throw new ComposeError("DEVFN_COMPOSE_STOP_FAILED", `Unable to stop Compose service ${service.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  public async logs(service: ManagedComposeService, tail: number | null = 200): Promise<string> {
    if (service.logsDisabled) return "";
    const baseArgs = ["compose", "-p", service.projectName, ...service.files.flatMap((file) => ["-f", file])];
    return (await this.run("docker", [...baseArgs, "logs", "--no-color", ...(tail === null ? [] : ["--tail", String(tail)]), service.composeService], { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
  }

  public async status(service: ManagedComposeService): Promise<"running" | "stopped"> {
    if (service.containerIds.length === 0) return "stopped";
    try {
      const { stdout } = await this.run("docker", ["inspect", "--format", "{{.State.Running}}", ...service.containerIds], { timeout: 10_000, maxBuffer: 1024 * 1024 });
      return stdout.split(/\s+/).filter(Boolean).every((value) => value === "true") ? "running" : "stopped";
    } catch { return "stopped"; }
  }
}
