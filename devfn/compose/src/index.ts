import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { assertEnvironmentKeyCasing, isCredentialKey, resolveContainedPath, type ComposeServiceSpec } from "@devfn/config";
import { waitForReadiness } from "@devfn/processes";
import { createScopedPathInterpolator, dotenvDependencyExpression, readComposeEnvDefinitions, selectedInterpolationReferences, simpleInterpolation } from "./path-interpolation.js";
import { assertComposeSourceGraphBounded, composeInterpolationEnvFiles, normalizeComposeRawService, pathInterpolationNames, reconcileComposeUniqueResources, type ComposeSourceInventory } from "./source-files.js";

const execFileAsync = promisify(execFile);
const MINIMUM_COMPOSE_VERSION = [2, 24, 4] as const;
const COMPOSE_SOURCE_BUDGET_MS = 20_000;
const INHERITED_COMPOSE_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "XDG_RUNTIME_DIR", "SystemRoot", "ComSpec", "PATHEXT"] as const;

function remainingComposeTime(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Compose source validation exceeded the aggregate time budget.");
  return remaining;
}

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
  const result = { ...environment, ...spec.env, ...generated };
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

function interpolationNameEnd(value: string, start: number): number {
  let end = start + 1;
  while (end < value.length && /\w/.test(value[end])) end += 1;
  return end;
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
    const nameEnd = interpolationNameEnd(value, start);
    if (braced && nextClose < nameEnd && !noMoreCloses) {
      nextClose = value.indexOf("}", nameEnd);
      noMoreCloses = nextClose < 0;
    }
    yield { start: index, end: braced && nextClose >= nameEnd ? nextClose + 1 : nameEnd, name: value.slice(start, nameEnd) };
    index = nameEnd;
  }
}

/** Check only the selected effective model, after Compose has applied overlays. */
function assertSelectedInterpolation(value: unknown, forbidden: ReadonlySet<string>, referenced: Set<string>,
  values: NodeJS.ProcessEnv, unknownValues?: ReadonlySet<string>): void {
  if (typeof value === "string") {
    for (const name of selectedInterpolationReferences(value, values, { unknownValues })) {
      if (forbidden.has(name)) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose input interpolates an inherited host value without an explicit allowlist.");
      referenced.add(name);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) assertSelectedInterpolation(item, forbidden, referenced, values, unknownValues);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) assertSelectedInterpolation(item, forbidden, referenced, values, unknownValues);
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
  for (const [parent, keys] of [["healthcheck", ["disable"]], ["build", ["no_cache", "pull", "privileged"]]] as const) {
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

function durationComposeInterpolations(service: Record<string, unknown>): Map<string, string> {
  const names = new Map<string, string>();
  const durations = new Set(["stop_grace_period", "interval", "timeout", "start_period", "start_interval", "delay"]);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (durations.has(key) && typeof item === "string") {
        for (const token of interpolationTokens(item)) {
          // A unit supplied by the source must not be repeated by the mask.
          names.set(token.name, item.slice(token.end).trim() ? "1" : "1s");
        }
      } else if (item && typeof item === "object") visit(item);
    }
  };
  visit(service);
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

interface ConfigEnvProvenance { value?: string; secretDerived: boolean }
type ConfigScope = Array<[string, string]>;
const MAX_CONFIG_EXPANSION_BYTES = 10 * 1024 * 1024;

function selectedConfigDeclaration(scopes: readonly ConfigScope[], name: string,
  scopeLimit: number, declarationLimit: number): { scope: number; index: number; expression: string } | undefined {
  for (let scope = 0; scope <= scopeLimit; scope += 1) {
    const declarations = scopes[scope];
    const limit = scope === scopeLimit ? declarationLimit : declarations.length;
    for (let index = limit - 1; index >= 0; index -= 1) {
      if (declarations[index][0] === name) return { scope, index, expression: declarations[index][1] };
    }
  }
  return undefined;
}

async function configScopeDeclarations(scopes: ComposeSourceInventory["interpolationScopes"]): Promise<ConfigScope[]> {
  return await Promise.all(scopes.map(async (scope) => {
    const declarations: ConfigScope = [];
    for (const file of await composeInterpolationEnvFiles([scope])) {
      declarations.push(...(await readComposeEnvDefinitions(file)).declarations);
    }
    return declarations;
  }));
}

function selectedConfigDeclarations(scopes: readonly ConfigScope[], names: ReadonlySet<string>,
  environment: NodeJS.ProcessEnv): Set<string> {
  const selected = new Set<string>();
  const visit = (name: string, scopeLimit: number, declarationLimit: number): void => {
    if (Object.hasOwn(environment, name)) return;
    const declaration = selectedConfigDeclaration(scopes, name, scopeLimit, declarationLimit);
    if (!declaration) return;
    const identity = `${declaration.scope}:${declaration.index}`;
    if (selected.has(identity)) return;
    selected.add(identity);
    if (selected.size > 128) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Compose interpolation exceeds the variable limit.");
    for (const dependency of pathInterpolationNames(dotenvDependencyExpression(declaration.expression))) {
      visit(dependency, declaration.scope, declaration.index);
    }
  };
  for (const name of names) visit(name, scopes.length - 1, scopes.at(-1)?.length ?? 0);
  return selected;
}

function interpolationNames(value: unknown, names: Set<string>): void {
  if (typeof value === "string") for (const name of pathInterpolationNames(value)) names.add(name);
  else if (Array.isArray(value)) for (const item of value) interpolationNames(item, names);
  else if (value && typeof value === "object") for (const item of Object.values(value)) interpolationNames(item, names);
}

function appendConfigDeclaration(name: string, expression: string, knownValues: NodeJS.ProcessEnv,
  local: Map<string, ConfigEnvProvenance>, prior: Map<string, ConfigEnvProvenance>, secretNames: ReadonlySet<string>,
  budget: { remaining: number }, unknownValues: Set<string>): void {
  const dependencies = selectedInterpolationReferences(expression, knownValues, { dotenvQuotes: true, unknownValues });
  const secretDerived = secretNames.has(name) || isCredentialKey(name) || [...dependencies].some((key) =>
    secretNames.has(key) || isCredentialKey(key) || local.get(key)?.secretDerived || prior.get(key)?.secretDerived);
  const unresolvedDependency = [...dependencies].some((key) => unknownValues.has(key));
  const evaluated = unresolvedDependency ? undefined : simpleInterpolation(expression, knownValues, 0, budget.remaining, true);
  const value = evaluated;
  if (value !== undefined) budget.remaining -= Buffer.byteLength(value);
  if (budget.remaining < 0) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Compose interpolation exceeds the aggregate byte limit.");
  local.set(name, { value, secretDerived });
  if (value === undefined) { unknownValues.add(name); knownValues[name] = ""; }
  else { unknownValues.delete(name); knownValues[name] = value; }
}

function configScopeProvenance(declarations: ConfigScope, scopeIndex: number, selected: ReadonlySet<string>,
  environment: NodeJS.ProcessEnv, prior: Map<string, ConfigEnvProvenance>,
  secretNames: ReadonlySet<string>, budget: { remaining: number }): Map<string, ConfigEnvProvenance> {
  const local = new Map<string, ConfigEnvProvenance>();
  const knownValues: NodeJS.ProcessEnv = Object.assign(Object.create(null), environment);
  const unknownValues = new Set<string>();
  for (const [name, entry] of prior) {
    knownValues[name] = entry.value ?? "";
    if (entry.value === undefined) unknownValues.add(name);
  }
  for (const [index, [name, expression]] of declarations.entries()) {
    if (!selected.has(`${scopeIndex}:${index}`) || Object.hasOwn(environment, name) || prior.has(name)) continue;
    appendConfigDeclaration(name, expression, knownValues, local, prior, secretNames, budget, unknownValues);
  }
  return local;
}

interface SelectedInterpolationState { values: NodeJS.ProcessEnv; secretDerived: Set<string>; unknownValues: Set<string> }

async function selectedComposeInterpolationValues(inventory: ComposeSourceInventory,
  environment: NodeJS.ProcessEnv, secretNames: ReadonlySet<string>,
  extraNames: ReadonlySet<string> = new Set()): Promise<SelectedInterpolationState> {
  const scopes = await configScopeDeclarations(inventory.interpolationScopes);
  const names = new Set(extraNames);
  interpolationNames(inventory.service, names);
  if (inventory.service) interpolationNames(selectedComposeResources(inventory.resources, inventory.service), names);
  const selected = selectedConfigDeclarations(scopes, names, environment);
  const definitions = new Map<string, ConfigEnvProvenance>();
  const budget = { remaining: MAX_CONFIG_EXPANSION_BYTES };
  for (const [index, declarations] of scopes.entries()) {
    const local = configScopeProvenance(declarations, index, selected, environment, definitions, secretNames, budget);
    for (const [name, entry] of local) if (!definitions.has(name)) definitions.set(name, entry);
  }
  const values: NodeJS.ProcessEnv = { ...environment };
  const unknownValues = new Set<string>();
  for (const [name, entry] of definitions) {
    values[name] = entry.value ?? "";
    if (entry.value === undefined) unknownValues.add(name);
  }
  return { values, unknownValues,
    secretDerived: new Set([...definitions].filter(([, entry]) => entry.secretDerived).map(([name]) => name)) };
}

async function selectedConfigEnvironmentContent(variable: string, environment: NodeJS.ProcessEnv,
  inventory: ComposeSourceInventory, deadline: number, secretNames: ReadonlySet<string>): Promise<{ content?: string; secretDerived: boolean }> {
  if (Object.hasOwn(environment, variable)) return { content: environment[variable], secretDerived: secretNames.has(variable) };
  const scopes = inventory.interpolationScopes;
  const declarations = await configScopeDeclarations(scopes);
  const selected = selectedConfigDeclarations(declarations, new Set([variable]), environment);
  const definitions = new Map<string, ConfigEnvProvenance>();
  const budget = { remaining: MAX_CONFIG_EXPANSION_BYTES };
  for (const [index, entries] of declarations.entries()) {
    const local = configScopeProvenance(entries, index, selected, environment, definitions, secretNames, budget);
    for (const [name, entry] of local) if (!definitions.has(name)) definitions.set(name, entry);
  }
  if (!definitions.has(variable)) return { secretDerived: false };
  const interpolate = createScopedPathInterpolator(environment, deadline, new Set(), true);
  const content = definitions.get(variable)!.value ?? (await interpolate([`\${${variable}}`], inventory.serviceDirectory, [], scopes))[0];
  return { content, secretDerived: definitions.get(variable)!.secretDerived };
}

function credentialSafeContentState(content: string | undefined): string {
  if (content === undefined) return "<secret-absent>";
  return content === "" ? "<secret-empty>" : "<secret-present>";
}

async function configEnvironmentState(variable: string, environment: NodeJS.ProcessEnv,
  secretNames: ReadonlySet<string>, inventory: ComposeSourceInventory, deadline: number,
  remainingBytes: number): Promise<{ state: string | null; bytes: number }> {
  const { content, secretDerived } = await selectedConfigEnvironmentContent(variable, environment, inventory, deadline, secretNames);
  const bytes = content === undefined ? 0 : Buffer.byteLength(content);
  if (bytes > remainingBytes) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose config contents exceed the byte limit.");
  if (secretDerived || secretNames.has(variable) || isCredentialKey(variable)) {
    return { state: credentialSafeContentState(content), bytes };
  }
  return { state: content === undefined ? null : createHash("sha256").update(content).digest("hex"), bytes };
}

async function selectedConfigFileState(resources: Record<string, unknown>, environment: NodeJS.ProcessEnv,
  secretNames: ReadonlySet<string>, inventory: ComposeSourceInventory, deadline: number): Promise<Record<string, unknown>> {
  const configs = resources.configs;
  if (!configs || typeof configs !== "object" || Array.isArray(configs)) return {};
  const state: Record<string, unknown> = {};
  let totalBytes = 0;
  for (const [name, value] of Object.entries(configs)) {
    const definition = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (typeof definition.file === "string") {
      const bytes = await boundedConfigFileBytes(definition.file, 10 * 1024 * 1024 - totalBytes);
      totalBytes += bytes.length;
      state[name] = createHash("sha256").update(bytes).digest("hex");
    } else if (typeof definition.environment === "string") {
      const { state: environmentState, bytes } = await configEnvironmentState(definition.environment, environment,
        secretNames, inventory, deadline, 10 * 1024 * 1024 - totalBytes);
      totalBytes += bytes;
      state[name] = environmentState;
    }
  }
  return state;
}

function quotedEnvInterpolation(value: string, quote: string): string {
  if (quote === "'") return value.replaceAll("$", () => "$$");
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === "\\") {
      result += "\\\\";
      index += 1;
    } else if (value[index] === "\\" && value[index + 1] === "$") {
      result += "$$";
      index += 1;
    } else result += value[index];
  }
  return result;
}

function closingEnvQuote(line: string, start: number, quote: string): number {
  for (let cursor = start; cursor < line.length; cursor += 1) {
    if (line[cursor] === "\\" && cursor + 1 < line.length) { cursor += 1; continue; }
    if (line[cursor] === quote) return cursor;
  }
  return -1;
}

function quotedEnvFileValue(lines: string[], startLine: number, startCursor: number, quote: string): { value: string; lastLine: number } {
  const parts: string[] = [];
  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const valueStart = lineIndex === startLine ? startCursor : 0;
    const close = closingEnvQuote(line, valueStart, quote);
    if (close >= 0) {
      parts.push(line.slice(valueStart, close));
      const rest = line.slice(close + 1).trimStart();
      if (rest && !rest.startsWith("#")) throw new Error("unsupported env_file assignment");
      return { value: quotedEnvInterpolation(parts.join("\n"), quote), lastLine: lineIndex };
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
  // Compose accepts a UTF-8 BOM at the beginning of an env file.
  const line = lineIndex === 0 ? lines[lineIndex].replace(/^\uFEFF/, "") : lines[lineIndex];
  let cursor = skipEnvSpaces(line, 0);
  if (line[cursor] === "#" || cursor === line.length) return undefined;
  if (line.startsWith("export", cursor) && /[ \t]/.test(line[cursor + 6] ?? "")) cursor = skipEnvSpaces(line, cursor + 6);
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

function envFileAssignments(content: string): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  const lines = content.split(/\r?\n/);
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const assignment = envFileAssignment(lines, lineIndex);
    if (assignment) values.push([assignment.name, assignment.value]);
    lineIndex = (assignment?.lastLine ?? lineIndex) + 1;
  }
  return values;
}

type InterpolationScopes = ComposeSourceInventory["interpolationScopes"];
interface EnvFileDeclaration { path: string; required?: boolean; format?: string; devfnOrigin?: string; devfnScopes?: InterpolationScopes }

function envFileDeclarations(inventory: ComposeSourceInventory): EnvFileDeclaration[] {
  const declared = inventory.service?.env_file;
  let files: unknown[] = [];
  if (Array.isArray(declared)) files = declared;
  else if (declared != null) files = [declared];
  const entries = files.map((entry) => typeof entry === "string"
    ? { path: entry, required: true, devfnOrigin: inventory.serviceDirectory }
    : entry as EnvFileDeclaration);
  if (entries.some((entry) => typeof entry.path !== "string")) throw new Error("invalid env_file path");
  return entries;
}

async function resolvedEnvFilePaths(entries: readonly EnvFileDeclaration[], inventory: ComposeSourceInventory,
  interpolate: ReturnType<typeof createScopedPathInterpolator>): Promise<string[]> {
  const resolved = new Array<string>(entries.length);
  const byOrigin = new Map<string, { origin: string; scopes: InterpolationScopes; indices: number[] }>();
  for (const [index, entry] of entries.entries()) {
    const origin = entry.devfnOrigin ?? inventory.serviceDirectory;
    const scopes = entry.devfnScopes ?? inventory.interpolationScopes;
    const key = JSON.stringify([origin, scopes]);
    const group = byOrigin.get(key) ?? { origin, scopes, indices: [] };
    group.indices.push(index);
    byOrigin.set(key, group);
  }
  for (const { origin, scopes, indices } of byOrigin.values()) {
    const values = await interpolate(indices.map((index) => entries[index].path), origin, [], scopes);
    for (const [offset, index] of indices.entries()) {
      if (!values[offset]) throw new Error("empty env_file path");
      resolved[index] = path.resolve(origin, values[offset]);
    }
  }
  return resolved;
}

async function readEnvFileContent(filename: string, required: boolean | undefined, remaining: number): Promise<string | undefined> {
  try {
    const size = (await stat(filename)).size;
    if (size > remaining) throw new Error("env_file byte limit");
    const content = await readFile(filename, "utf8");
    if (Buffer.byteLength(content) > remaining) throw new Error("env_file byte limit");
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && required === false) return undefined;
    throw error;
  }
}

async function rawEnvFileValues(inventory: ComposeSourceInventory, service: string,
  interpolate: ReturnType<typeof createScopedPathInterpolator>): Promise<Array<[string, string]>> {
  try {
    const entries = envFileDeclarations(inventory);
    const resolved = await resolvedEnvFilePaths(entries, inventory, interpolate);
    const values: Array<[string, string]> = [];
    let remaining = 10 * 1024 * 1024;
    for (const [index, entry] of entries.entries()) {
      const content = await readEnvFileContent(resolved[index], entry.required, remaining);
      if (content === undefined) continue;
      remaining -= Buffer.byteLength(content);
      if (entry.format !== "raw") values.push(...envFileAssignments(content));
    }
    return values;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inventory Compose env_file provenance for ${service}.`);
  }
}

function selectedEnvFileState(declarations: readonly (readonly [string, string])[], interpolation: SelectedInterpolationState,
  secretNames: ReadonlySet<string>, overridden: ReadonlySet<string>): {
    references: Set<string>; secretDerived: Set<string>;
  } {
  const known: NodeJS.ProcessEnv = { ...interpolation.values };
  const unknownValues = new Set(interpolation.unknownValues);
  const selected = new Map<string, { references: Set<string>; secretDerived: boolean }>();
  let remaining = MAX_CONFIG_EXPANSION_BYTES;
  for (const [name, expression] of declarations) {
    const references = selectedInterpolationReferences(expression, known, { unknownValues });
    const secretDerived = secretNames.has(name) || isCredentialKey(name) || [...references].some((reference) =>
      secretNames.has(reference) || isCredentialKey(reference) || interpolation.secretDerived.has(reference)
      || (!Object.hasOwn(interpolation.values, reference) && selected.get(reference)?.secretDerived));
    const resolved = [...references].some((reference) => unknownValues.has(reference))
      ? undefined : simpleInterpolation(expression, known, 0, remaining, true);
    if (resolved !== undefined) {
      remaining -= Buffer.byteLength(resolved);
      if (!Object.hasOwn(interpolation.values, name)) {
        known[name] = resolved;
        unknownValues.delete(name);
      }
    } else if (!Object.hasOwn(interpolation.values, name)) {
      known[name] = "";
      unknownValues.add(name);
    }
    selected.set(name, { references, secretDerived });
  }
  const references = new Set<string>();
  const secretDerived = new Set<string>();
  for (const [name, entry] of selected) {
    if (overridden.has(name)) continue;
    for (const reference of entry.references) references.add(reference);
    if (entry.secretDerived) secretDerived.add(name);
  }
  return { references, secretDerived };
}

function explicitServiceEnvironmentKeys(inventory: ComposeSourceInventory): Set<string> {
  const environment = inventory.service?.environment;
  return new Set(environment && typeof environment === "object" && !Array.isArray(environment)
    ? Object.keys(environment) : []);
}

function assertSelectedEnvFileReferences(inventory: ComposeSourceInventory, spec: ComposeServiceSpec,
  environment: NodeJS.ProcessEnv, unknownValues?: ReadonlySet<string>): void {
  const references = new Set<string>();
  assertSelectedInterpolation(inventory.service?.env_file, implicitInterpolationKeys(spec), references, environment, unknownValues);
  if ([...references].some((name) => isCredentialKey(name) || spec.secretEnv?.includes(name))) {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose env_file path interpolates a secret value.");
  }
}

async function assertSelectedResourcePaths(inventory: ComposeSourceInventory,
  scopedPaths: ReturnType<typeof createScopedPathInterpolator>): Promise<void> {
  if (!inventory.service) return;
  const resources = selectedComposeResources(inventory.resources, inventory.service);
  const paths: string[] = [];
  for (const kind of ["configs", "secrets"] as const) {
    const declarations = resources[kind];
    if (!declarations || typeof declarations !== "object" || Array.isArray(declarations)) continue;
    for (const value of Object.values(declarations)) {
      if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).file === "string") {
        paths.push((value as Record<string, string>).file);
      }
    }
  }
  if (paths.length) await scopedPaths(paths, inventory.serviceDirectory, [], inventory.interpolationScopes);
}

/** Read selected raw references without a Compose config subprocess. */
export async function selectedComposeEndpointReferences(spec: ComposeServiceSpec, root: string,
  environment: NodeJS.ProcessEnv, deadline = Date.now() + COMPOSE_SOURCE_BUDGET_MS): Promise<Set<string>> {
  try {
    const sourceFile = await resolveContainedPath(root, spec.file ?? "compose.yaml", `services.${spec.service}.file`);
    const scopedPaths = createScopedPathInterpolator(environment, deadline, implicitInterpolationKeys(spec));
    const inventory = await assertComposeSourceGraphBounded(sourceFile, spec.service, scopedPaths,
      implicitInterpolationKeys(spec), new Set(spec.secretEnv ?? []));
    await assertSelectedResourcePaths(inventory, scopedPaths);
    const rawEnvDeclarations = inventory.service?.env_file !== undefined
      ? await rawEnvFileValues(inventory, spec.service, scopedPaths) : [];
    const extraNames = new Set<string>();
    for (const [, expression] of rawEnvDeclarations) for (const name of pathInterpolationNames(expression)) extraNames.add(name);
    const interpolation = await selectedComposeInterpolationValues(inventory, environment,
      new Set(spec.secretEnv ?? []), extraNames);
    const references = new Set<string>();
    assertSelectedInterpolation(inventory.service, implicitInterpolationKeys(spec), references,
      interpolation.values, interpolation.unknownValues);
    if (inventory.service?.env_file !== undefined) {
      assertSelectedEnvFileReferences(inventory, spec, interpolation.values, interpolation.unknownValues);
      const selected = selectedEnvFileState(rawEnvDeclarations, interpolation,
        new Set(spec.secretEnv ?? []), explicitServiceEnvironmentKeys(inventory));
      for (const name of selected.references) {
        if (implicitInterpolationKeys(spec).has(name)) {
          throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose input interpolates an inherited host value without an explicit allowlist.");
        }
        references.add(name);
      }
    }
    return new Set([...references].filter((name) => name.startsWith("DEVFN_URL_")));
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inspect selected Compose endpoint references for ${spec.service}.`);
  }
}

/** Ask Compose about selected-scope presence without rendering credential bytes. */
async function probeComposeInterpolationPresence(
  names: readonly string[], projectDirectory: string, envFiles: readonly string[], environment: NodeJS.ProcessEnv, deadline: number,
): Promise<Map<string, boolean | null>> {
  remainingComposeTime(deadline);
  const directory = await mkdtemp(path.join(tmpdir(), "devfn-compose-presence-"));
  const helper = path.join(directory, "compose.yaml");
  try {
    const probes = Object.fromEntries([...names].map((name) => [name, {
      present: `\${${name}+x}`, nonempty: `\${${name}:+x}`,
    }]));
    await writeFile(helper, JSON.stringify({ "x-devfn-presence": probes, services: { placeholder: { image: "busybox" } } }), { mode: 0o600 });
    const output = (await execFileAsync("docker", ["compose", ...envFiles.flatMap((file) => ["--env-file", file]),
      "--project-directory", projectDirectory, "-f", helper, "config", "--format", "json"],
    { cwd: projectDirectory, env: environment, timeout: remainingComposeTime(deadline), maxBuffer: 10 * 1024 * 1024 })).stdout;
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
  names: ReadonlySet<string>, inventory: ComposeSourceInventory, projectDirectory: string, environment: NodeJS.ProcessEnv, deadline: number,
): Promise<Map<string, boolean | null>> {
  // Compose variable names cannot contain dots or hyphens. Such names can
  // still be environment keys, but placing them in ${...} makes the probe
  // invalid before the valid service is started.
  const variableNames = [...names].filter((name) => /^[A-Za-z_]\w*$/.test(name));
  if (variableNames.length === 0) return new Map();
  const scopes = inventory.interpolationScopes.length ? inventory.interpolationScopes
    : [{ directory: projectDirectory, envFiles: [] }];
  const presence = new Map<string, boolean | null>();
  const scopeDefinitions = await Promise.all(scopes.map(async (scope) => {
    const values = new Map<string, string>();
    for (const file of await composeInterpolationEnvFiles([scope])) {
      for (const [name, value] of await readComposeEnvDefinitions(file)) values.set(name, value);
    }
    return values;
  }));
  const selected = new Map<number, string[]>();
  for (const name of variableNames) {
    if (Object.hasOwn(environment, name)) { presence.set(name, environment[name] !== ""); continue; }
    const index = scopeDefinitions.findIndex((values) => values.has(name));
    if (index < 0) { presence.set(name, null); continue; }
    const group = selected.get(index) ?? [];
    group.push(name);
    selected.set(index, group);
  }
  // Only the first scope defining each secret can win Compose precedence.
  // Probe those scopes as groups; unrelated nested projects need no Docker call.
  const scopedPaths = createScopedPathInterpolator(environment, deadline, new Set());
  await Promise.all([...selected].map(async ([index, selectedNames]) => {
    const scope = scopes[index];
    const dependencies = new Set<string>();
    for (const name of selectedNames) {
      for (const token of interpolationTokens(scopeDefinitions[index].get(name)!)) {
        if (!Object.hasOwn(environment, token.name) && scopeDefinitions.slice(0, index).some((values) => values.has(token.name))) {
          dependencies.add(token.name);
        }
      }
    }
    const inherited: Record<string, string> = {};
    if (dependencies.size) {
      const names = [...dependencies];
      const values = await scopedPaths(names.map((name) => `\${${name}}`), scope.directory, [], scopes.slice(0, index));
      for (const [offset, name] of names.entries()) inherited[name] = values[offset];
    }
    const values = await probeComposeInterpolationPresence(selectedNames, scope.directory,
      await composeInterpolationEnvFiles([scope]), { ...environment, ...inherited }, deadline);
    for (const name of selectedNames) presence.set(name, values.get(name) ?? null);
  }));
  return presence;
}

type ComposeConfiguration = { services?: Record<string, Record<string, unknown>> };

interface CredentialSafeComposeInput {
  args: string[];
  root: string;
  environment: NodeJS.ProcessEnv;
  sourceFile: string;
  inventory: ComposeSourceInventory;
  rawService: Record<string, unknown>;
  rawSelectedResources: Record<string, unknown>;
  maskNames: ReadonlySet<string>;
  service: string;
  deadline: number;
}

async function credentialSafeComposeConfiguration(input: CredentialSafeComposeInput): Promise<ComposeConfiguration> {
  const { args, root, environment, sourceFile, inventory, rawService, rawSelectedResources, maskNames, service, deadline } = input;
  try {
    const presence = await composeInterpolationPresence(maskNames, inventory, path.dirname(sourceFile), environment, deadline);
    // Missing variables must stay missing so Compose chooses the same default.
    // Typed fields use valid sentinels while credential bytes stay out of the digest.
    const booleanNames = booleanComposeInterpolations(rawService, rawSelectedResources);
    const durationNames = durationComposeInterpolations(rawService);
    const masked = [...maskNames].filter((name) => presence.has(name)).map((name) => {
      let value = "";
      if (presence.get(name)) value = booleanNames.has(name) ? "true" : durationNames.get(name) ?? "1";
      return [name, value];
    });
    const maskedEnvironment = { ...environment, ...Object.fromEntries(masked) };
    const output = (await execFileAsync("docker", args, { cwd: root, env: maskedEnvironment,
      timeout: remainingComposeTime(deadline), maxBuffer: 10 * 1024 * 1024 })).stdout;
    return JSON.parse(output) as ComposeConfiguration;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve credential-safe Compose configuration for ${service}.`);
  }
}

/** Fingerprint effective Compose inputs without hashing inherited host or secret values. */
export async function fingerprintComposeSource(spec: ComposeServiceSpec, root: string, instanceId: string, environment: NodeJS.ProcessEnv,
  deadline = Date.now() + COMPOSE_SOURCE_BUDGET_MS): Promise<string> {
  const sourceFile = await resolveContainedPath(root, spec.file ?? "compose.yaml", `services.${spec.service}.file`);
  const referencedInterpolation = new Set<string>();
  const scopedPaths = createScopedPathInterpolator(environment, deadline, implicitInterpolationKeys(spec));
  let inventory: ComposeSourceInventory;
  try {
    inventory = await assertComposeSourceGraphBounded(sourceFile, spec.service, scopedPaths, implicitInterpolationKeys(spec), new Set(spec.secretEnv ?? []));
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to inventory Compose sources for ${spec.service}.`);
  }
  await assertSelectedResourcePaths(inventory, scopedPaths);
  const rawEnvDeclarations = inventory.service?.env_file !== undefined
    ? await rawEnvFileValues(inventory, spec.service, scopedPaths) : [];
  const extraNames = new Set<string>();
  for (const [, expression] of rawEnvDeclarations) for (const name of pathInterpolationNames(expression)) extraNames.add(name);
  const interpolation = await selectedComposeInterpolationValues(inventory, environment,
    new Set(spec.secretEnv ?? []), extraNames);
  const interpolationValues = interpolation.values;
  if (inventory.service?.env_file !== undefined) assertSelectedEnvFileReferences(inventory, spec, interpolationValues,
    interpolation.unknownValues);
  const envFileState = selectedEnvFileState(rawEnvDeclarations, interpolation,
    new Set(spec.secretEnv ?? []), explicitServiceEnvironmentKeys(inventory));
  let effective: string;
  const args = ["compose", "-p", composeProjectName(spec.projectName ?? "devfn", instanceId),
    "-f", sourceFile, "config", "--format", "json"];
  try {
    effective = (await execFileAsync("docker", args,
      { cwd: root, env: environment, timeout: remainingComposeTime(deadline), maxBuffer: 10 * 1024 * 1024 })).stdout;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve effective Compose configuration for ${spec.service}.`);
  }
  let configuration: ComposeConfiguration;
  try {
    configuration = JSON.parse(effective) as typeof configuration;
  } catch {
    throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve effective Compose configuration for ${spec.service}.`);
  }
  const rawConfiguration = await uninterpolatedComposeConfiguration(args, root, environment, spec.service, inventory, deadline,
    configuration.services?.[spec.service]);
  const service = configuration.services?.[spec.service];
  const rawFound = rawConfiguration.services?.[spec.service];
  const rawService = rawFound ? normalizeComposeRawService(rawFound) : undefined;
  if (!service || !rawService) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${spec.service} is absent from the effective configuration.`);
  const { env_file: _rawEnvFiles, environment: _rawServiceEnvironment, ...rawEffectiveService } = rawService;
  const selectedResources = selectedComposeResources(configuration, service);
  const rawSelectedResources = selectedComposeResources(rawConfiguration, service);
  assertSelectedInterpolation(rawEffectiveService, implicitInterpolationKeys(spec), referencedInterpolation,
    interpolationValues, interpolation.unknownValues);
  assertSelectedInterpolation(rawService.env_file, implicitInterpolationKeys(spec), referencedInterpolation,
    interpolationValues, interpolation.unknownValues);
  assertSelectedInterpolation(rawSelectedResources, implicitInterpolationKeys(spec), referencedInterpolation,
    interpolationValues, interpolation.unknownValues);
  const effectiveEnvironment = service.environment && typeof service.environment === "object" && !Array.isArray(service.environment)
    ? service.environment as Record<string, unknown> : {};
  const rawDeclaredEnvironment = inventory.service?.environment;
  assertSelectedInterpolation(rawDeclaredEnvironment, implicitInterpolationKeys(spec), referencedInterpolation,
    interpolationValues, interpolation.unknownValues);
  for (const name of envFileState.references) {
    if (implicitInterpolationKeys(spec).has(name)) {
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", "Selected Compose input interpolates an inherited host value without an explicit allowlist.");
    }
    referencedInterpolation.add(name);
  }
  const maskNames = new Set([...(spec.secretEnv ?? []), ...Object.keys(environment).filter(isCredentialKey),
    ...Object.keys(effectiveEnvironment).filter(isCredentialKey), ...[...referencedInterpolation].filter(isCredentialKey),
    ...interpolation.secretDerived]);
  const secretNames = new Set([...maskNames, ...envFileState.secretDerived]);
  assertSelectedInterpolation(inventory.service?.env_file, new Set([...implicitInterpolationKeys(spec), ...secretNames]),
    referencedInterpolation, interpolationValues, interpolation.unknownValues);
  const safeConfiguration = secretNames.size > 0
    ? await credentialSafeComposeConfiguration({ args, root, environment, sourceFile, inventory, rawService,
      rawSelectedResources, maskNames, service: spec.service, deadline })
    : configuration;
  const safeSelected = safeConfiguration.services?.[spec.service];
  if (!safeSelected) throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Compose service ${spec.service} is absent from the effective configuration.`);
  const { env_file: _safeEnvFiles, environment: _safeEnvironment, ...safeEffectiveService } = safeSelected;
  const safeService = canonicalComposeValue(safeEffectiveService, secretNames);
  const safeResources = canonicalComposeValue(selectedComposeResources(safeConfiguration, safeSelected), secretNames);
  const configFiles = await selectedConfigFileState(selectedResources, environment, secretNames, inventory, deadline);
  const declared = safeSelected.environment;
  const declaredEnvironment = declared && typeof declared === "object" && !Array.isArray(declared)
    ? declared as Record<string, unknown> : {};
  return createHash("sha256")
    .update(JSON.stringify(safeService))
    .update("\0").update(JSON.stringify(canonicalDeclaredEnvironment(declaredEnvironment, secretNames)))
    .update("\0").update(JSON.stringify(safeResources))
    .update("\0").update(JSON.stringify(configFiles)).digest("hex");
}

async function uninterpolatedComposeConfiguration(args: string[], root: string, environment: NodeJS.ProcessEnv, service: string,
  inventory: ComposeSourceInventory, deadline: number, effective?: Record<string, unknown>): Promise<{ services?: Record<string, Record<string, unknown>> }> {
  try {
    const output = (await execFileAsync("docker", [...args.slice(0, -3), "config", "--no-interpolate", "--format", "json"],
      { cwd: root, env: environment, timeout: remainingComposeTime(deadline), maxBuffer: 10 * 1024 * 1024 })).stdout;
    const parsed = JSON.parse(output) as { services?: Record<string, Record<string, unknown>> };
    const raw = parsed.services?.[service];
    if (raw) {
      const inventoryDevices = inventory.deviceCandidates;
      const effectiveDevices = effective?.devices;
      const rawDeviceCount = Array.isArray(raw.devices) ? raw.devices.length : 0;
      const source = Array.isArray(effectiveDevices) && effectiveDevices.length > rawDeviceCount
        ? { ...raw, devices: inventoryDevices } : raw;
      const identityPaths = createScopedPathInterpolator(environment, deadline, new Set());
      parsed.services![service] = await reconcileComposeUniqueResources(source,
        (values) => identityPaths(values, inventory.serviceDirectory, [], inventory.interpolationScopes), effective);
    }
    return parsed;
  } catch {
    // Supported Compose versions may reject valid typed and env_file fields
    // under --no-interpolate. The normal config already succeeded; use the
    // bounded inventory for raw provenance when this diagnostic view fails.
    if (!inventory.service) {
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve Compose source provenance for ${service}.`);
    }
    try {
      const identityPaths = createScopedPathInterpolator(environment, deadline, new Set());
      const source = inventory.deviceCandidates.length
        ? { ...inventory.service, devices: inventory.deviceCandidates } : inventory.service;
      const selected = await reconcileComposeUniqueResources(source,
        (values) => identityPaths(values, inventory.serviceDirectory, [], inventory.interpolationScopes), effective);
      return { ...inventory.resources, services: { [service]: selected } };
    } catch {
      throw new ComposeError("DEVFN_COMPOSE_START_FAILED", `Unable to resolve Compose source provenance for ${service}.`);
    }
  }
}

/** Read Compose's effective service networks before publishing sibling DNS URLs. */
export async function effectiveComposeServiceNetworks(spec: ComposeServiceSpec, root: string, instanceId: string, environment: NodeJS.ProcessEnv,
  deadline = Date.now() + COMPOSE_SOURCE_BUDGET_MS, selectedReferences?: Set<string>): Promise<string[]> {
  const sourceFile = await resolveContainedPath(root, spec.file ?? "compose.yaml", `services.${spec.service}.file`);
  try {
    const scopedPaths = createScopedPathInterpolator(environment, deadline, implicitInterpolationKeys(spec));
    const inventory = await assertComposeSourceGraphBounded(sourceFile, spec.service,
      scopedPaths, implicitInterpolationKeys(spec), new Set(spec.secretEnv ?? []));
    await assertSelectedResourcePaths(inventory, scopedPaths);
    const rawEnvDeclarations = inventory.service?.env_file !== undefined
      ? await rawEnvFileValues(inventory, spec.service, scopedPaths) : [];
    const extraNames = new Set<string>();
    for (const [, expression] of rawEnvDeclarations) for (const name of pathInterpolationNames(expression)) extraNames.add(name);
    const interpolation = await selectedComposeInterpolationValues(inventory, environment,
      new Set(spec.secretEnv ?? []), extraNames);
    const interpolationValues = interpolation.values;
    if (inventory.service?.env_file !== undefined) {
      assertSelectedEnvFileReferences(inventory, spec, interpolationValues, interpolation.unknownValues);
    }
    const envFileState = selectedEnvFileState(rawEnvDeclarations, interpolation,
      new Set(spec.secretEnv ?? []), explicitServiceEnvironmentKeys(inventory));
    const args = ["compose", "-p", composeProjectName(spec.projectName ?? "devfn", instanceId), "-f", sourceFile, "config", "--format", "json"];
    const output = (await execFileAsync("docker", args, { cwd: root, env: environment, timeout: remainingComposeTime(deadline), maxBuffer: 10 * 1024 * 1024 })).stdout;
    const configuration = JSON.parse(output) as { services?: Record<string, { networks?: Record<string, unknown> | string[]; network_mode?: string }>; networks?: Record<string, { name?: string }> };
    const service = configuration.services?.[spec.service];
    if (!service) throw new Error("missing service");
    const rawConfig = await uninterpolatedComposeConfiguration(args, root, environment, spec.service, inventory, deadline);
    const rawFound = rawConfig.services?.[spec.service];
    const rawService = rawFound ? normalizeComposeRawService(rawFound) : undefined;
    if (!rawService) throw new Error("missing service");
    const references = new Set<string>();
    // Older Compose versions resolve env_file values even with
    // --no-interpolate. Inspect the selected source expressions instead so an
    // escaped literal dollar cannot look like an inherited host reference.
    const { environment: _resolvedEnvironment, ...rawWithoutEnvironment } = rawService;
    assertSelectedInterpolation(rawWithoutEnvironment, implicitInterpolationKeys(spec), references,
      interpolationValues, interpolation.unknownValues);
    const sourceEnvironment = inventory.service?.environment;
    const selectedSourceEnvironment = sourceEnvironment && typeof sourceEnvironment === "object" && !Array.isArray(sourceEnvironment)
      ? sourceEnvironment as Record<string, unknown> : {};
    assertSelectedInterpolation(selectedSourceEnvironment, implicitInterpolationKeys(spec), references,
      interpolationValues, interpolation.unknownValues);
    for (const name of envFileState.references) {
      if (implicitInterpolationKeys(spec).has(name)) throw new Error("inherited host value");
      references.add(name);
    }
    assertSelectedInterpolation(selectedComposeResources(rawConfig, service), implicitInterpolationKeys(spec), references,
      interpolationValues, interpolation.unknownValues);
    for (const name of references) selectedReferences?.add(name);
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
  const match = /(?:^|\D)(\d+)\.(\d+)\.(\d+)(?:\D|$)/.exec(output);
  if (!match) return false;
  const actual = match.slice(1, 4).map(Number);
  for (let index = 0; index < MINIMUM_COMPOSE_VERSION.length; index += 1) {
    if (actual[index] !== MINIMUM_COMPOSE_VERSION[index]) return actual[index] > MINIMUM_COMPOSE_VERSION[index];
  }
  return true;
}

function dockerContainerMissing(error: unknown): boolean {
  const candidate = error as { message?: unknown; stderr?: unknown };
  const stderr = typeof candidate.stderr === "string" ? candidate.stderr : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const detail = `${stderr}\n${message}`;
  return /no such (?:object|container)/i.test(detail);
}

interface EffectivePort { target: number; published?: string | number; host_ip?: string; protocol?: string }

function effectivePortBindings(ports: EffectivePort[]): string[] {
  return ports.map((port) => {
    const published = String(port.published ?? "");
    if (!Number.isInteger(port.target) || port.target < 1 || (published !== "" && !/^\d+(?:-\d+)?$/.test(published))) throw new Error("Compose returned an unsupported published port.");
    return `${port.target}/${port.protocol ?? "tcp"}|${port.host_ip || "0.0.0.0"}|${published}`;
  }).sort(compareCanonicalKeys);
}

function containerPortBindings(value: Record<string, Array<{ HostIp: string; HostPort: string }> | null> | null): string[] {
  return Object.entries(value ?? {}).flatMap(([target, bindings]) => {
    if (!bindings) throw new Error("Docker returned an incomplete port binding.");
    return bindings.map((binding) => `${target}|${binding.HostIp || "0.0.0.0"}|${binding.HostPort}`);
  }).sort(compareCanonicalKeys);
}

function bindingsMatch(expected: string[], observed: string[]): boolean {
  if (expected.length !== observed.length) return false;
  const unmatched = [...observed];
  const bySpecificity = [...expected].sort((left, right) => {
    const score = (item: string) => {
      const value = item.split("|")[2];
      if (value === "" || value === "0") return 2;
      return value.includes("-") ? 1 : 0;
    };
    return score(left) - score(right) || compareCanonicalKeys(left, right);
  });
  for (const binding of bySpecificity) {
    const [target, host, published] = binding.split("|");
    const range = /^(\d+)-(\d+)$/.exec(published);
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
        const expectedHash = /^\S+ ([a-f0-9]{64})$/.exec(hashOutput)?.[1];
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
