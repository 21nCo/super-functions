import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ComposeServiceSpec } from "@devfn/config";
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
}

export interface ComposeStartInput {
  name: string;
  spec: ComposeServiceSpec;
  root: string;
  runtimeDir: string;
  instanceId: string;
  ports: Record<string, number>;
  environment?: Record<string, string>;
}

export class ComposeError extends Error {
  public constructor(public readonly code: "DEVFN_COMPOSE_UNAVAILABLE" | "DEVFN_COMPOSE_START_FAILED" | "DEVFN_COMPOSE_STOP_FAILED", message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ComposeError";
  }
}

function safeName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48); }

function composeEnvironment(spec: ComposeServiceSpec, generated: Record<string, string> = {}): NodeJS.ProcessEnv {
  const base = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "XDG_RUNTIME_DIR", "SystemRoot", "ComSpec", "PATHEXT"];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [...base, ...(spec.envAllowlist ?? [])]) if (process.env[key] !== undefined) environment[key] = process.env[key];
  return { ...environment, ...generated, ...(spec.env ?? {}) };
}

export function renderComposeOverride(spec: ComposeServiceSpec, ports: Record<string, number>): string {
  const mappings = Object.entries(spec.ports ?? {}).map(([name, internal]) => {
    const host = ports[name];
    if (!host) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Missing allocation ${name} for Compose service ${spec.service}.`);
    return `      - \"127.0.0.1:${host}:${internal}\"`;
  });
  return ["services:", `  ${spec.service}:`, ...(mappings.length ? ["    ports:", ...mappings] : ["    {}"]), ""].join("\n");
}

export class ComposeController {
  public async available(): Promise<boolean> {
    try { await execFileAsync("docker", ["compose", "version"], { timeout: 5000 }); return true; } catch { return false; }
  }

  public async start(input: ComposeStartInput): Promise<ManagedComposeService> {
    if (!await this.available()) throw new ComposeError("DEVFN_COMPOSE_UNAVAILABLE", "Docker Compose is unavailable.");
    const projectName = safeName(input.spec.projectName ?? `devfn-${input.instanceId}`);
    const sourceFile = path.resolve(input.root, input.spec.file ?? "compose.yaml");
    const overrideDir = path.join(input.runtimeDir, "compose");
    await mkdir(overrideDir, { recursive: true, mode: 0o700 });
    const overrideFile = path.join(overrideDir, `${input.name}.override.yaml`);
    await writeFile(overrideFile, renderComposeOverride(input.spec, input.ports), { encoding: "utf8", mode: 0o600 });
    const files = [sourceFile, overrideFile];
    const baseArgs = ["compose", "-p", projectName, ...files.flatMap((file) => ["-f", file])];
    const before = await this.containerIds(baseArgs, input.spec.service, true);
    const beforeRunning = await this.containerIds(baseArgs, input.spec.service, false);
    const environment = composeEnvironment(input.spec, input.environment);
    try {
      await execFileAsync("docker", [...baseArgs, "up", "-d", "--no-recreate", input.spec.service], { cwd: input.root, env: environment, timeout: 120_000 });
      const containerIds = await this.containerIds(baseArgs, input.spec.service);
      if (containerIds.length === 0) throw new Error("Compose returned no container IDs.");
      await waitForReadiness({ health: input.spec.health, ports: input.ports, logPath: overrideFile, cwd: input.root, environment, isAlive: () => true });
      return { name: input.name, composeService: input.spec.service, projectName, files, containerIds, preExisting: before.length > 0, wasRunning: beforeRunning.length > 0, startedAt: new Date().toISOString() };
    } catch (error) {
      await this.stop({ name: input.name, composeService: input.spec.service, projectName, files, containerIds: [], preExisting: before.length > 0, wasRunning: beforeRunning.length > 0, startedAt: new Date().toISOString() }).catch(() => undefined);
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to start Compose service ${input.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async containerIds(baseArgs: string[], service: string, all = false): Promise<string[]> {
    try { return (await execFileAsync("docker", [...baseArgs, "ps", ...(all ? ["-a"] : []), "-q", service], { timeout: 10_000 })).stdout.split(/\s+/).filter(Boolean); } catch { return []; }
  }

  public async stop(service: ManagedComposeService): Promise<void> {
    if (service.preExisting && service.wasRunning) return;
    const baseArgs = ["compose", "-p", service.projectName, ...service.files.flatMap((file) => ["-f", file])];
    try {
      await execFileAsync("docker", [...baseArgs, "stop", service.composeService], { timeout: 30_000 });
      if (!service.preExisting) await execFileAsync("docker", [...baseArgs, "rm", "-f", service.composeService], { timeout: 30_000 });
    } catch (error) {
      throw new ComposeError("DEVFN_COMPOSE_STOP_FAILED", `Unable to stop Compose service ${service.name}.`, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  public async logs(service: ManagedComposeService, tail = 200): Promise<string> {
    const baseArgs = ["compose", "-p", service.projectName, ...service.files.flatMap((file) => ["-f", file])];
    return (await execFileAsync("docker", [...baseArgs, "logs", "--no-color", "--tail", String(tail), service.composeService], { timeout: 10_000 })).stdout;
  }

  public async status(service: ManagedComposeService): Promise<"running" | "stopped"> {
    if (service.containerIds.length === 0) return "stopped";
    try {
      const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", ...service.containerIds], { timeout: 10_000 });
      return stdout.split(/\s+/).filter(Boolean).every((value) => value === "true") ? "running" : "stopped";
    } catch { return "stopped"; }
  }
}
