import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { assertEnvironmentKeyCasing, isCredentialKey, resolveContainedPath, type ComposeServiceSpec } from "@devfn/config";
import { waitForReadiness } from "@devfn/processes";
import { assertComposeSourceGraphBounded, normalizeComposeRawService, type ComposeSourceInventory } from "./source-files.js";

const execFileAsync = promisify(execFile);
const MINIMUM_COMPOSE_VERSION = [2, 24, 4] as const;
const INHERITED_COMPOSE_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "XDG_RUNTIME_DIR", "SystemRoot", "ComSpec", "PATHEXT"] as const;

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
  composeCwd?: string;
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
  /** Host-side environment used only by command readiness probes. */
  readinessEnvironment?: Record<string, string>;
  onStarted?: (service: ManagedComposeService) => Promise<void>;
}

export class ComposeError extends Error {
  public constructor(public readonly code: "DEVFN_COMPOSE_UNAVAILABLE" | "DEVFN_COMPOSE_START_FAILED" | "DEVFN_COMPOSE_STOP_FAILED", message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ComposeError";
  }
}

/** The effective Docker Compose namespace shared by startup and endpoint resolution. */
export function composeProjectName(prefix: string, instanceId: string): string {
  const ownerDigest = createHash("sha256").update(instanceId).digest("hex").slice(0, 20);
  // The readable prefix is lossy (punctuation and length are normalized).
  // Hash the exact accepted prefix: punctuation, length and case are all
  // significant to the declared project even though Docker renders them alike.
  const prefixDigest = createHash("sha256").update(prefix).digest("hex").slice(0, 12);
  const suffix = `p-${prefixDigest}-o-${ownerDigest}`;
  const budget = 48 - suffix.length - 1;
  let safePrefix = "";
  for (const character of prefix.toLowerCase()) {
    if (safePrefix.length >= budget) break;
    const safe = /[a-z0-9_-]/.test(character) ? character : "-";
    if (safe === "-" && safePrefix.endsWith("-")) continue;
    if (!safePrefix && (safe === "-" || safe === "_")) continue;
    safePrefix += safe;
  }
  let end = safePrefix.length;
  while (end > 0 && (safePrefix[end - 1] === "-" || safePrefix[end - 1] === "_")) end -= 1;
  safePrefix = safePrefix.slice(0, end) || "d";
  return `${safePrefix}-${suffix}`;
}

export function createComposeEnvironment(spec: ComposeServiceSpec, generated: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const base = INHERITED_COMPOSE_ENV_KEYS;
  assertEnvironmentKeyCasing(base, spec.envAllowlist ?? [], Object.keys(spec.env ?? {}), Object.keys(generated));
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [...base, ...(spec.envAllowlist ?? [])]) if (source[key] !== undefined) environment[key] = source[key];
  const result = { ...environment, ...(spec.env ?? {}), ...generated };
  // Compose accepts HOME as an interpolation input, while Docker uses it to
  // locate its CLI plugin and auth config. Preserve the original Docker config
  // location when a declared profile supplies a different HOME.
  if (result.HOME !== source.HOME && result.DOCKER_CONFIG === undefined && source.HOME) result.DOCKER_CONFIG = path.join(source.HOME, ".docker");
  return result;
}

function implicitInterpolationKeys(spec: ComposeServiceSpec): Set<string> {
  const explicit = new Set([...(spec.envAllowlist ?? []), ...Object.keys(spec.env ?? {})]);
  return new Set(INHERITED_COMPOSE_ENV_KEYS.filter((key) => !explicit.has(key)));
}

function* interpolationTokens(value: string): Generator<{ start: number; end: number; name: string }> {
  let nextClose = -1;
  let noMoreCloses = false;
  let index = 0;
  while (index + 1 < value.length) {
    if (value[index] !== "$") { index += 1; continue; }
    if (value[index + 1] === "$") { index += 2; continue; }
    const braced = value[index + 1] === "{";
    const start = index + (braced ? 2 : 1);
    if (!/[A-Za-z_]/.test(value[start] ?? "")) { index += 1; continue; }
    let nameEnd = start + 1;
    while (nameEnd < value.length && /[A-Za-z0-9_]/.test(value[nameEnd])) nameEnd += 1;
    if (braced && nextClose < nameEnd && !noMoreCloses) {
      nextClose = value.indexOf("}", nameEnd);
      noMoreCloses = nextClose < 0;
    }
    yield { start: index, end: braced && nextClose >= nameEnd ? nextClose + 1 : nameEnd, name: value.slice(start, nameEnd) };
    index = nameEnd;
  }
}

/** Check only the selected effective model, after Compose has applied overlays. */
function assertSelectedInterpolation(value: unknown, forbidden: ReadonlySet<string>, referenced: Set<string>): void {
  if (typeof value === "string") {
    for (const { name } of interpolationTokens(value)) {
      if (forbidden.has(name)) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose input interpolates an inherited host value without an explicit allowlist.");
      referenced.add(name);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) assertSelectedInterpolation(item, forbidden, referenced);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) assertSelectedInterpolation(item, forbidden, referenced);
  }
}

/** Build host-side readiness environment without publishing inherited secrets in endpoint plans. */
export function createComposeReadinessEnvironment(spec: ComposeServiceSpec, resolved: Record<string, string>): NodeJS.ProcessEnv {
  const source = spec.health?.type === "command" ? process.env : resolved;
  return createComposeEnvironment({ ...spec, env: resolved }, resolved, source);
}

function compareCanonicalKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalComposeValue(value: unknown, secretNames: ReadonlySet<string>, key?: string): unknown {
  if (key === "environment" && value && typeof value === "object" && !Array.isArray(value)) {
    return canonicalDeclaredEnvironment(value as Record<string, unknown>, secretNames);
  }
  if (Array.isArray(value)) return value.map((item) => canonicalComposeValue(item, secretNames));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCanonicalKeys(left, right))
      .map(([name, item]) => [name, canonicalComposeValue(item, secretNames, name)]));
  }
  return value;
}

function canonicalDeclaredEnvironment(values: Record<string, unknown>, secretNames: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => compareCanonicalKeys(left, right))
    .map(([key, value]) => [key, isCredentialKey(key) || secretNames.has(key)
      ? "<secret-channel>" : canonicalComposeValue(value, secretNames)]));
}

function booleanResourceValues(resources: Record<string, unknown>): unknown[] {
  const values: unknown[] = [];
  for (const kind of ["volumes", "networks", "configs", "secrets"] as const) {
    const entries = resources[kind];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const resource of Object.values(entries)) {
      if (!resource || typeof resource !== "object" || Array.isArray(resource)) continue;
      const definition = resource as Record<string, unknown>;
      for (const field of ["external", "internal", "attachable", "enable_ipv4", "enable_ipv6"]) values.push(definition[field]);
    }
  }
  return values;
}

function booleanComposeInterpolations(service: Record<string, unknown>, resources: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const selected = ["attach", "init", "privileged", "read_only", "stdin_open", "tty"].map((name) => service[name]);
  for (const [parent, keys] of [["healthcheck", ["disable"]], ["build", ["no_cache", "pull"]]] as const) {
    const value = service[parent];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of keys) selected.push((value as Record<string, unknown>)[key]);
    }
  }
  selected.push(...booleanResourceValues(resources));
  for (const value of selected) if (typeof value === "string") {
    for (const token of interpolationTokens(value)) names.add(token.name);
  }
  return names;
}

function referencedResourceNames(kind: "volumes" | "networks" | "configs" | "secrets", references: unknown): string[] {
  if (kind === "networks" && references && typeof references === "object" && !Array.isArray(references)) {
    return Object.keys(references);
  }
  if (!Array.isArray(references)) return [];
  const names: string[] = [];
  for (const entry of references) {
    if (typeof entry === "string") names.push(kind === "volumes" ? entry.split(":", 1)[0] : entry);
    else if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).source === "string") {
      names.push((entry as Record<string, string>).source);
    }
  }
  return names;
}

function selectedComposeResources(
  configuration: Record<string, unknown>,
  service: Record<string, unknown>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const kind of ["volumes", "networks", "configs", "secrets"] as const) {
    const declared = configuration[kind];
    if (!declared || typeof declared !== "object" || Array.isArray(declared)) continue;
    const names = referencedResourceNames(kind, service[kind]);
    const resources = Object.fromEntries(names.filter((name) => Object.hasOwn(declared, name))
      .map((name) => [name, (declared as Record<string, unknown>)[name]]));
    if (Object.keys(resources).length) selected[kind] = resources;
  }
  return selected;
}

async function boundedConfigFileBytes(file: string, remaining: number): Promise<Buffer> {
  const size = (await stat(file)).size;
  if (size > remaining) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose config files exceed the byte limit.");
  const bytes = await readFile(file);
  if (bytes.length > remaining) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose config files exceed the byte limit.");
  return bytes;
}

async function selectedConfigFileState(resources: Record<string, unknown>): Promise<Record<string, unknown>> {
  const configs = resources.configs;
  if (!configs || typeof configs !== "object" || Array.isArray(configs)) return {};
  const state: Record<string, unknown> = {};
  let totalBytes = 0;
  for (const [name, value] of Object.entries(configs)) {
    const file = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).file : undefined;
    if (typeof file !== "string") continue;
    const bytes = await boundedConfigFileBytes(file, 10 * 1024 * 1024 - totalBytes);
    totalBytes += bytes.length;
    state[name] = createHash("sha256").update(bytes).digest("hex");
  }
  return state;
}

function quotedEnvFileValue(lines: string[], startLine: number, startCursor: number, quote: string): { value: string; lastLine: number } {
  const parts: string[] = [];
  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let cursor = lineIndex === startLine ? startCursor : 0;
    const valueStart = cursor;
    while (cursor < line.length) {
      if (line[cursor] === "\\" && cursor + 1 < line.length) { cursor += 2; continue; }
      if (line[cursor] === quote) {
        parts.push(line.slice(valueStart, cursor));
        const rest = line.slice(cursor + 1).trimStart();
        if (rest && !rest.startsWith("#")) throw new Error("unsupported env_file assignment");
        return { value: quote === "'" ? "" : parts.join("\n"), lastLine: lineIndex };
      }
      cursor += 1;
    }
    parts.push(line.slice(valueStart));
  }
  throw new Error("unterminated env_file quote");
}

function skipEnvSpaces(line: string, start: number): number {
  let cursor = start;
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  return cursor;
}

function unquotedEnvFileValue(line: string, start: number): string {
  const tail = line.slice(start);
  for (let offset = 1; offset < tail.length; offset += 1) {
    if (tail[offset] === "#" && (tail[offset - 1] === " " || tail[offset - 1] === "\t")) {
      return tail.slice(0, offset).trimEnd();
    }
  }
  return tail.trimEnd();
}

function envFileAssignment(lines: string[], lineIndex: number): { name: string; value: string; lastLine: number } | undefined {
  const line = lines[lineIndex];
  let cursor = skipEnvSpaces(line, 0);
  if (line[cursor] === "#" || cursor === line.length) return undefined;
  if (line.startsWith("export ", cursor)) cursor = skipEnvSpaces(line, cursor + 7);
  const start = cursor;
  if (!/[A-Za-z_]/.test(line[cursor] ?? "")) throw new Error("unsupported env_file assignment");
  while (cursor < line.length && /[A-Za-z0-9_.-]/.test(line[cursor])) cursor += 1;
  const name = line.slice(start, cursor);
  cursor = skipEnvSpaces(line, cursor);
  if (cursor === line.length) return { name, value: `$${name}`, lastLine: lineIndex };
  if (line[cursor] !== "=" && line[cursor] !== ":") throw new Error("unsupported env_file assignment");
  cursor = skipEnvSpaces(line, cursor + 1);
  const quote = line[cursor] === "'" || line[cursor] === '"' ? line[cursor] : null;
  if (quote) {
    // Single-quoted values are literal in Compose, even across lines.
    const result = quotedEnvFileValue(lines, lineIndex, cursor + 1, quote);
    return { name, value: result.value, lastLine: result.lastLine };
  }
  return { name, value: unquotedEnvFileValue(line, cursor), lastLine: lineIndex };
}

function envFileAssignments(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const assignment = envFileAssignment(lines, lineIndex);
    if (assignment) values[assignment.name] = assignment.value;
    lineIndex = (assignment?.lastLine ?? lineIndex) + 1;
  }
  return values;
}

async function rawEnvFileValues(inventory: ComposeSourceInventory, environment: NodeJS.ProcessEnv, service: string): Promise<Record<string, string>> {
  try {
    const declared = inventory.service?.env_file;
    const files = declared == null ? [] : Array.isArray(declared) ? declared : [declared];
    const entries = files.map((entry) => typeof entry === "string"
      ? { path: entry, required: true, devfnOrigin: inventory.serviceDirectory }
      : entry as { path: string; required?: boolean; format?: string; devfnOrigin?: string });
    if (entries.some((entry) => typeof entry.path !== "string")) throw new Error("invalid env_file path");
    const resolved = new Array<string>(entries.length);
    const byOrigin = new Map<string, number[]>();
    for (const [index, entry] of entries.entries()) {
      const origin = entry.devfnOrigin ?? inventory.serviceDirectory;
      const indices = byOrigin.get(origin) ?? [];
      indices.push(index);
      byOrigin.set(origin, indices);
    }
    for (const [origin, indices] of byOrigin) {
      const values = await interpolateComposePaths(indices.map((index) => entries[index].path), origin, environment, inventory.interpolationEnvFiles);
      for (const [offset, index] of indices.entries()) resolved[index] = path.resolve(origin, values[offset]);
    }
    const values: Record<string, string> = {};
    let totalBytes = 0;
    for (const [index, entry] of entries.entries()) {
      const filename = resolved[index];
      let content: string;
      try {
        const size = (await stat(filename)).size;
        if (size > 10 * 1024 * 1024 - totalBytes) throw new Error("env_file byte limit");
        content = await readFile(filename, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && entry.required === false) continue;
        throw error;
      }
      totalBytes += Buffer.byteLength(content);
      if (totalBytes > 10 * 1024 * 1024) throw new Error("env_file byte limit");
      if (entry.format !== "raw") Object.assign(values, envFileAssignments(content));
    }
    return values;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inventory Compose env_file provenance for ${service}.`);
  }
}

async function interpolateComposePaths(paths: string[], root: string, environment: NodeJS.ProcessEnv, envFiles: string[] = []): Promise<string[]> {
  if (!paths.some((name) => name.includes("$"))) return paths;
  // Ask the accepted Compose version to apply its own interpolation grammar.
  // A private temporary extension field avoids resolving or serializing env-file
  // contents, and avoids a second, subtly different interpolation parser here.
  const directory = await mkdtemp(path.join(tmpdir(), "devfn-compose-paths-"));
  const helper = path.join(directory, "compose.yaml");
  try {
    await writeFile(helper, JSON.stringify({ "x-devfn-paths": paths, services: { placeholder: { image: "busybox" } } }), { mode: 0o600 });
    const output = (await execFileAsync("docker", ["compose", ...envFiles.flatMap((file) => ["--env-file", file]), "--project-directory", root, "-f", helper, "config", "--format", "json"],
      { cwd: root, env: environment, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
    const resolved = (JSON.parse(output) as { "x-devfn-paths"?: unknown })["x-devfn-paths"];
    if (!Array.isArray(resolved) || resolved.length !== paths.length || resolved.some((name) => typeof name !== "string")) throw new Error("invalid Compose path interpolation");
    return resolved as string[];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Ask Compose about selected-scope presence without rendering credential bytes. */
async function probeComposeInterpolationPresence(
  names: readonly string[], projectDirectory: string, envFiles: readonly string[], environment: NodeJS.ProcessEnv,
): Promise<Map<string, boolean | null>> {
  const directory = await mkdtemp(path.join(tmpdir(), "devfn-compose-presence-"));
  const helper = path.join(directory, "compose.yaml");
  try {
    const probes = Object.fromEntries([...names].map((name) => [name, {
      present: `\${${name}+x}`, nonempty: `\${${name}:+x}`,
    }]));
    await writeFile(helper, JSON.stringify({ "x-devfn-presence": probes, services: { placeholder: { image: "busybox" } } }), { mode: 0o600 });
    const output = (await execFileAsync("docker", ["compose", ...envFiles.flatMap((file) => ["--env-file", file]),
      "--project-directory", projectDirectory, "-f", helper, "config", "--format", "json"],
    { cwd: projectDirectory, env: environment, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
    const resolved = (JSON.parse(output) as { "x-devfn-presence"?: Record<string, { present?: unknown; nonempty?: unknown }> })["x-devfn-presence"];
    if (!resolved || typeof resolved !== "object") throw new Error("invalid Compose presence probe");
    return new Map([...names].map((name) => {
      const value = resolved[name];
      if (!value || !["", "x"].includes(String(value.present)) || !["", "x"].includes(String(value.nonempty))) {
        throw new Error("invalid Compose presence result");
      }
      return [name, value.present === "" ? null : value.nonempty === "x"];
    }));
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Unable to resolve Compose interpolation provenance.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function composeInterpolationPresence(
  names: ReadonlySet<string>, inventory: ComposeSourceInventory, projectDirectory: string, environment: NodeJS.ProcessEnv,
): Promise<Map<string, boolean | null>> {
  // Compose variable names cannot contain dots or hyphens. Such names can
  // still be environment keys, but placing them in ${...} makes the probe
  // invalid before the valid service is started.
  const variableNames = [...names].filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  if (variableNames.length === 0) return new Map();
  const scoped = await probeComposeInterpolationPresence(variableNames, inventory.serviceDirectory,
    inventory.interpolationEnvFiles, environment);
  if (inventory.serviceDirectory === projectDirectory && inventory.interpolationEnvFiles.length === 0) return scoped;
  // An included service has its own env-file defaults, but the parent
  // project environment takes precedence. Probe both scopes without ever
  // emitting the values, then use the parent presence when it is defined.
  const parent = await probeComposeInterpolationPresence(variableNames, projectDirectory, [], environment);
  return new Map(variableNames.map((name) => [name, parent.get(name) ?? scoped.get(name) ?? null]));
}

/** Fingerprint effective Compose inputs without hashing inherited host or secret values. */
export async function fingerprintComposeSource(spec: ComposeServiceSpec, root: string, instanceId: string, environment: NodeJS.ProcessEnv): Promise<string> {
  const sourceFile = await resolveContainedPath(root, spec.file ?? "compose.yaml", `services.${spec.service}.file`);
  const referencedInterpolation = new Set<string>();
  let inventory: ComposeSourceInventory;
  try {
    inventory = await assertComposeSourceGraphBounded(sourceFile, spec.service, (names, directory, files) => interpolateComposePaths(names, directory, environment, files), implicitInterpolationKeys(spec), new Set(spec.secretEnv ?? []));
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inventory Compose sources for ${spec.service}.`);
  }
  let effective: string;
  const args = ["compose", "-p", composeProjectName(spec.projectName ?? "devfn", instanceId),
    "-f", sourceFile, "config", "--format", "json"];
  try {
    effective = (await execFileAsync("docker", args,
      { cwd: root, env: environment, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve effective Compose configuration for ${spec.service}.`);
  }
  let configuration: { services?: Record<string, Record<string, unknown>> };
  try {
    configuration = JSON.parse(effective) as typeof configuration;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve effective Compose configuration for ${spec.service}.`);
  }
  const rawConfiguration = await uninterpolatedComposeConfiguration(args, root, environment, spec.service, inventory);
  const service = configuration.services?.[spec.service];
  const rawFound = rawConfiguration.services?.[spec.service];
  const rawService = rawFound ? normalizeComposeRawService(rawFound) : undefined;
  if (!service || !rawService) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${spec.service} is absent from the effective configuration.`);
  const { env_file: _rawEnvFiles, environment: _rawServiceEnvironment, ...rawEffectiveService } = rawService;
  const selectedResources = selectedComposeResources(configuration, service);
  const rawSelectedResources = selectedComposeResources(rawConfiguration, service);
  assertSelectedInterpolation(rawEffectiveService, implicitInterpolationKeys(spec), referencedInterpolation);
  assertSelectedInterpolation(rawService.env_file, implicitInterpolationKeys(spec), referencedInterpolation);
  assertSelectedInterpolation(rawSelectedResources, implicitInterpolationKeys(spec), referencedInterpolation);
  const effectiveEnvironment = service.environment && typeof service.environment === "object" && !Array.isArray(service.environment)
    ? service.environment as Record<string, unknown> : {};
  const secretNames = new Set([...(spec.secretEnv ?? []), ...Object.keys(environment).filter(isCredentialKey),
    ...Object.keys(effectiveEnvironment).filter(isCredentialKey), ...[...referencedInterpolation].filter(isCredentialKey)]);
  assertSelectedInterpolation(inventory.service?.env_file, new Set([...implicitInterpolationKeys(spec), ...secretNames]), referencedInterpolation);
  const rawDeclaredEnvironment = inventory.service?.environment;
  const rawEnvironment = {
    ...(inventory.service?.env_file !== undefined
      ? await rawEnvFileValues(inventory, environment, spec.service) : {}),
    ...(rawDeclaredEnvironment && typeof rawDeclaredEnvironment === "object" && !Array.isArray(rawDeclaredEnvironment)
      ? rawDeclaredEnvironment as Record<string, unknown> : {}),
  };
  assertSelectedInterpolation(rawEnvironment, implicitInterpolationKeys(spec), referencedInterpolation);
  let safeConfiguration = configuration;
  if (secretNames.size > 0) {
    try {
      const presence = await composeInterpolationPresence(secretNames, inventory, path.dirname(sourceFile), environment);
      // A missing variable must stay missing so Compose can choose the same
      // default branch. Typed fields need stable valid sentinels: numeric
      // ports accept 1, while Boolean service fields require true.
      const booleanNames = booleanComposeInterpolations(rawService, rawSelectedResources);
      const masked = [...secretNames].filter((name) => presence.has(name) && presence.get(name) !== null).map((name) => {
        let value = "";
        if (presence.get(name)) value = booleanNames.has(name) ? "true" : "1";
        return [name, value];
      });
      const maskedEnvironment = { ...environment, ...Object.fromEntries(masked) };
      const output = (await execFileAsync("docker", args, { cwd: root, env: maskedEnvironment,
        timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
      safeConfiguration = JSON.parse(output) as typeof configuration;
    } catch {
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve credential-safe Compose configuration for ${spec.service}.`);
    }
  }
  const safeSelected = safeConfiguration.services?.[spec.service];
  if (!safeSelected) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${spec.service} is absent from the effective configuration.`);
  const { env_file: _safeEnvFiles, environment: _safeEnvironment, ...safeEffectiveService } = safeSelected;
  const safeService = canonicalComposeValue(safeEffectiveService, secretNames);
  const safeResources = canonicalComposeValue(selectedComposeResources(safeConfiguration, safeSelected), secretNames);
  const configFiles = await selectedConfigFileState(selectedResources);
  const ordinaryInterpolation = [...referencedInterpolation].filter((name) => !secretNames.has(name))
    .sort(compareCanonicalKeys).map((name) => [name, environment[name] ?? null]);
  return createHash("sha256")
    .update(JSON.stringify(safeService))
    .update("\0").update(JSON.stringify(canonicalDeclaredEnvironment(
      safeSelected.environment && typeof safeSelected.environment === "object" && !Array.isArray(safeSelected.environment)
        ? safeSelected.environment as Record<string, unknown> : {}, secretNames)))
    .update("\0").update(JSON.stringify(safeResources))
    .update("\0").update(JSON.stringify(configFiles))
    .update("\0").update(JSON.stringify(ordinaryInterpolation)).digest("hex");
}

async function uninterpolatedComposeConfiguration(args: string[], root: string, environment: NodeJS.ProcessEnv, service: string, inventory: ComposeSourceInventory): Promise<{ services?: Record<string, Record<string, unknown>> }> {
  try {
    const output = (await execFileAsync("docker", [...args.slice(0, -3), "config", "--no-interpolate", "--format", "json"],
      { cwd: root, env: environment, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
    return JSON.parse(output) as { services?: Record<string, Record<string, unknown>> };
  } catch {
    // Supported Compose versions may reject valid typed and env_file fields
    // under --no-interpolate. The normal config already succeeded; use the
    // bounded inventory for raw provenance when this diagnostic view fails.
    if (!inventory.service) {
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve Compose source provenance for ${service}.`);
    }
    return { ...inventory.resources, services: { [service]: inventory.service } };
  }
}

/** Read Compose's effective service networks before publishing sibling DNS URLs. */
export async function effectiveComposeServiceNetworks(spec: ComposeServiceSpec, root: string, instanceId: string, environment: NodeJS.ProcessEnv): Promise<string[]> {
  const sourceFile = await resolveContainedPath(root, spec.file ?? "compose.yaml", `services.${spec.service}.file`);
  try {
    const inventory = await assertComposeSourceGraphBounded(sourceFile, spec.service, (names, directory, files) => interpolateComposePaths(names, directory, environment, files), implicitInterpolationKeys(spec), new Set(spec.secretEnv ?? []));
    const args = ["compose", "-p", composeProjectName(spec.projectName ?? "devfn", instanceId), "-f", sourceFile, "config", "--format", "json"];
    const output = (await execFileAsync("docker", args, { cwd: root, env: environment, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 })).stdout;
    const configuration = JSON.parse(output) as { services?: Record<string, { networks?: Record<string, unknown> | string[]; network_mode?: string }>; networks?: Record<string, { name?: string }> };
    const service = configuration.services?.[spec.service];
    if (!service) throw new Error("missing service");
    const rawConfig = await uninterpolatedComposeConfiguration(args, root, environment, spec.service, inventory);
    const rawFound = rawConfig.services?.[spec.service];
    const rawService = rawFound ? normalizeComposeRawService(rawFound) : undefined;
    if (!rawService) throw new Error("missing service");
    assertSelectedInterpolation(rawService, implicitInterpolationKeys(spec), new Set());
    assertSelectedInterpolation(selectedComposeResources(rawConfig, service), implicitInterpolationKeys(spec), new Set());
    // Host/none/container namespace modes have no Compose DNS network. A
    // standalone service may still start; sibling URL wiring will be omitted.
    if (service.network_mode) return [];
    const keys = Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});
    if (!keys.length) return [];
    return keys.map((key) => configuration.networks?.[key]?.name ?? `${composeProjectName(spec.projectName ?? "devfn", instanceId)}_${key}`);
  } catch {
    // Compose output may contain interpolated credentials; never include it in an error.
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to verify effective Compose networks for ${spec.service}.`);
  }
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

interface EffectivePort { target: number; published?: string | number; host_ip?: string; protocol?: string }

function effectivePortBindings(ports: EffectivePort[]): string[] {
  return ports.map((port) => {
    const published = String(port.published ?? "");
    if (!Number.isInteger(port.target) || port.target < 1 || (published !== "" && !/^\d+(?:-\d+)?$/.test(published))) throw new Error("Compose returned an unsupported published port.");
    return `${port.target}/${port.protocol ?? "tcp"}|${port.host_ip || "0.0.0.0"}|${published}`;
  }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

function containerPortBindings(value: Record<string, Array<{ HostIp: string; HostPort: string }> | null> | null): string[] {
  return Object.entries(value ?? {}).flatMap(([target, bindings]) => {
    if (!bindings) throw new Error("Docker returned an incomplete port binding.");
    return bindings.map((binding) => `${target}|${binding.HostIp || "0.0.0.0"}|${binding.HostPort}`);
  }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

function bindingsMatch(expected: string[], observed: string[]): boolean {
  if (expected.length !== observed.length) return false;
  const unmatched = [...observed];
  const bySpecificity = [...expected].sort((left, right) => {
    const score = (item: string) => { const value = item.split("|")[2]; return value === "" || value === "0" ? 2 : value.includes("-") ? 1 : 0; };
    return score(left) - score(right) || (left < right ? -1 : left > right ? 1 : 0);
  });
  for (const binding of bySpecificity) {
    const [target, host, published] = binding.split("|");
    const range = published.match(/^(\d+)-(\d+)$/);
    const index = unmatched.findIndex((actual) => {
      const [actualTarget, actualHost, actualPort] = actual.split("|");
      if (target !== actualTarget || host !== actualHost || !/^\d+$/.test(actualPort)) return false;
      const port = Number(actualPort);
      return published === "" || published === "0" || (range ? port >= Number(range[1]) && port <= Number(range[2]) : published === actualPort);
    });
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
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
    const projectName = composeProjectName(input.spec.projectName ?? "devfn", input.instanceId);
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
    if (preservePreExisting) {
      try {
        const configuration = JSON.parse((await this.run("docker", [...baseArgs, "config", "--format", "json"], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 })).stdout) as { services?: Record<string, { environment?: Record<string, string>; ports?: EffectivePort[] }> };
        const serviceConfiguration = configuration.services?.[input.spec.service];
        if (!serviceConfiguration) throw new Error("Compose did not return the selected service.");
        const expected = serviceConfiguration.environment ?? {};
        if (typeof expected !== "object" || Array.isArray(expected)) throw new Error("Compose returned a malformed service environment.");
        const actualRows = (await this.run("docker", ["inspect", "--format", "{{json .Config.Env}}", ...before], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 })).stdout.trim().split("\n");
        if (actualRows.length !== before.length) throw new Error("Docker returned incomplete container environments.");
        for (const [index, row] of actualRows.entries()) {
          const actual = Object.fromEntries((JSON.parse(row) as string[]).map((entry) => {
            const separator = entry.indexOf("=");
            if (separator < 0) throw new Error("Docker returned a malformed container environment.");
            return [entry.slice(0, separator), entry.slice(separator + 1)];
          }));
          const extraKeys = Object.keys(actual).filter((key) => !Object.hasOwn(expected, key));
          if (Object.entries(expected).some(([key, value]) => actual[key] !== value) || extraKeys.some((key) => key.startsWith("DEVFN_"))) {
            throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} has a stale startup environment; refusing to reuse it.`);
          }
          if (extraKeys.length) {
            // Image defaults appear in Config.Env even when Compose does not set them.
            // A removed profile or service literal is safe only if it equals that default.
            const imageId = (await this.run("docker", ["inspect", "--format", "{{.Image}}", before[index]], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.trim();
            if (!imageId) throw new Error("Docker returned no container image ID.");
            const imageRows = JSON.parse((await this.run("docker", ["image", "inspect", "--format", "{{json .Config.Env}}", imageId], { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout) as string[] | null;
            const imageDefaults = Object.fromEntries((imageRows ?? []).map((entry) => {
              const separator = entry.indexOf("=");
              if (separator < 0) throw new Error("Docker returned a malformed image environment.");
              return [entry.slice(0, separator), entry.slice(separator + 1)];
            }));
            if (extraKeys.some((key) => actual[key] !== imageDefaults[key])) {
              throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} has a stale startup environment; refusing to reuse it.`);
            }
          }
        }
      } catch (error) {
        if (error instanceof ComposeError) throw error;
        throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to verify pre-existing Compose service ${input.name} environment.`);
      }
    }
    if (preservePreExisting) {
      try {
        // Compose's persisted service hash covers effective command, ports,
        // image and other startup settings that --no-recreate would retain.
        const hashOutput = (await this.run("docker", ["compose", "-p", projectName, "-f", sourceFile, "config", "--hash", input.spec.service],
          { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.trim();
        const expectedHash = hashOutput.match(/^\S+ ([a-f0-9]{64})$/)?.[1];
        if (!expectedHash || !hashOutput.startsWith(`${input.spec.service} `)) throw new Error("incomplete Compose service hash");
        const actualRows = (await this.run("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.config-hash" }}', ...before],
          { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.trim().split("\n");
        if (actualRows.length !== before.length) throw new Error("incomplete container config hashes");
        if (actualRows.some((row) => row !== expectedHash)) {
          throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} has a stale startup configuration; refusing to reuse it.`);
        }
        const configuration = JSON.parse((await this.run("docker", [...baseArgs, "config", "--format", "json"],
          { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 })).stdout) as { services?: Record<string, { ports?: EffectivePort[] }> };
        const service = configuration.services?.[input.spec.service];
        if (!service || (service.ports !== undefined && !Array.isArray(service.ports))) throw new Error("incomplete effective service ports");
        const expectedPorts = effectivePortBindings(service.ports ?? []);
        const portRows = (await this.run("docker", ["inspect", "--format", "{{json .HostConfig.PortBindings}}", ...before],
          { cwd: input.root, env: environment, timeout: 10_000, maxBuffer: 1024 * 1024 })).stdout.trim().split("\n");
        if (portRows.length !== before.length || portRows.some((row) => !bindingsMatch(expectedPorts, containerPortBindings(JSON.parse(row))))) {
          throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Pre-existing Compose service ${input.name} has stale published ports; refusing to reuse it.`);
        }
      } catch (error) {
        if (error instanceof ComposeError) throw error;
        throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to verify pre-existing Compose service ${input.name} configuration.`);
      }
    }
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
      const managed = { name: input.name, composeService: input.spec.service, projectName, files, containerIds, preExisting: preservePreExisting, wasRunning: preservePreExisting && startedContainerIds.length === 0, startedContainerIds, createdContainerIds, startedAt, logsDisabled: Boolean(input.spec.secretEnv?.length), dockerEnvironment, composeCwd: input.root };
      await input.onStarted?.(managed);
      await waitForReadiness({
        health: input.spec.health, ports: input.ports, logPath: overrideFile, cwd: input.root,
        environment: input.readinessEnvironment ? createComposeReadinessEnvironment(input.spec, input.readinessEnvironment) : environment,
        isAlive: async () => await this.status(managed) === "running",
        readLog: async () => await this.logs(managed, 1000, managed.startedAt),
      });
      return managed;
    } catch (error) {
      const cleanupIds = containerIds.length ? containerIds : (preservePreExisting ? before : []);
      const startedContainerIds = preservePreExisting ? cleanupIds.filter((id) => preExistingIds.has(id) && !previouslyRunning.has(id)) : cleanupIds;
      const createdContainerIds = preservePreExisting ? cleanupIds.filter((id) => !preExistingIds.has(id)) : cleanupIds;
      const failed = { name: input.name, composeService: input.spec.service, projectName, files, containerIds: cleanupIds, preExisting: preservePreExisting, wasRunning: preservePreExisting && startedContainerIds.length === 0, startedContainerIds, createdContainerIds, startedAt, dockerEnvironment, composeCwd: input.root };
      let cleanupError: unknown;
      try {
        if (cleanupIds.length) await this.stop(failed);
        else await this.stopWithCompose(failed, input.root, environment);
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure;
        if (cleanupIds.length === 0) {
          try { await input.onStarted?.(failed); }
          catch (journalFailure) {
            throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to start Compose service ${input.name}.`, {
              cause: error instanceof Error ? error.message : String(error),
              cleanupCause: cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure),
              journalCause: journalFailure instanceof Error ? journalFailure.message : String(journalFailure),
            });
          }
        }
      }
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to start Compose service ${input.name}.`, {
        cause: error instanceof Error ? error.message : String(error),
        ...(cleanupError === undefined ? {} : { cleanupCause: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }),
      });
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
    try {
      const environment = directDockerEnvironment(service.dockerEnvironment);
      if (stopIds.length === 0) {
        if (!service.preExisting && service.composeCwd) await this.stopWithCompose(service, service.composeCwd, environment);
        return;
      }
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
