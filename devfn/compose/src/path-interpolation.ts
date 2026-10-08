import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { isCredentialKey } from "@devfn/config";
import { composeInterpolationEnvFiles, pathInterpolationNames, type ComposeSourceInventory } from "./source-files.js";

const execFileAsync = promisify(execFile);
type InterpolationScopes = ComposeSourceInventory["interpolationScopes"];
type EnvDefinitions = Map<string, string> & { declarations: Array<[string, string]> };
const MAX_PATH_VALUE_BYTES = 64 * 1024;
const MAX_PATH_EXPANSION_BYTES = 2 * 1024 * 1024;

function boundedPathValue(value: string): string {
  if (Buffer.byteLength(value) > MAX_PATH_VALUE_BYTES) throw new Error("Compose path interpolation exceeds the value limit");
  return value;
}

function skipEnvWhitespace(line: string, start: number): number {
  let cursor = start;
  while (line[cursor] && /\s/u.test(line[cursor])) cursor += 1;
  return cursor;
}

function envDefinitionEnd(line: string, start: number): number {
  const quote = line[start];
  if (quote === "'" || quote === '"') {
    for (let cursor = start + 1; cursor < line.length; cursor += 1) {
      if (line[cursor] === "\\" && cursor + 1 < line.length) { cursor += 1; continue; }
      if (line[cursor] === quote) return line.slice(cursor + 1).trimStart().startsWith("#") ? cursor + 1 : line.length;
    }
    return line.length;
  }
  for (let cursor = start + 1; cursor < line.length; cursor += 1) {
    if (line[cursor] === "#" && /[ \t]/.test(line[cursor - 1])) return cursor;
  }
  return line.length;
}

function parseEnvDefinition(line: string): [string, string] | undefined {
  let cursor = skipEnvWhitespace(line, 0);
  if (line[cursor] === "#" || cursor === line.length) return undefined;
  if (line.startsWith("export", cursor) && line[cursor + 6] && /\s/u.test(line[cursor + 6])) {
    cursor = skipEnvWhitespace(line, cursor + 6);
  }
  const start = cursor;
  if (!/[A-Za-z_]/.test(line[cursor] ?? "")) return undefined;
  while (/\w/.test(line[cursor] ?? "")) cursor += 1;
  const name = line.slice(start, cursor);
  cursor = skipEnvWhitespace(line, cursor);
  if (line[cursor] !== "=" && line[cursor] !== ":") return undefined;
  cursor = skipEnvWhitespace(line, cursor + 1);
  return [name, boundedPathValue(line.slice(cursor, envDefinitionEnd(line, cursor)).trimEnd())];
}

export async function readComposeEnvDefinitions(file: string): Promise<EnvDefinitions> {
  const size = (await stat(file)).size;
  if (size > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const content = await readFile(file, "utf8");
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const found = new Map<string, string>() as EnvDefinitions;
  found.declarations = [];
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const line = index === 0 && source.codePointAt(0) === 0xfeff ? source.slice(1) : source;
    const entry = parseEnvDefinition(line);
    if (!entry) continue;
    const [name, value] = entry;
    found.declarations.push([name, value]);
    found.delete(name);
    found.set(name, value);
  }
  return found;
}

async function interpolateWithCompose(paths: string[], directory: string, environment: NodeJS.ProcessEnv,
  envFiles: string[], deadline: number): Promise<string[]> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Compose source validation exceeded the aggregate time budget");
  const temporary = await mkdtemp(path.join(tmpdir(), "devfn-compose-paths-"));
  const helper = path.join(temporary, "compose.yaml");
  try {
    await writeFile(helper, JSON.stringify({ "x-devfn-paths": paths, services: { placeholder: { image: "busybox" } } }), { mode: 0o600 });
    const output = (await execFileAsync("docker", ["compose", ...envFiles.flatMap((file) => ["--env-file", file]),
      "--project-directory", directory, "-f", helper, "config", "--format", "json"],
    { cwd: directory, env: environment, timeout: remaining, maxBuffer: 10 * 1024 * 1024 })).stdout;
    const resolved = (JSON.parse(output) as { "x-devfn-paths"?: unknown })["x-devfn-paths"];
    if (!Array.isArray(resolved) || resolved.length !== paths.length || resolved.some((name) => typeof name !== "string")) {
      throw new Error("invalid Compose path interpolation");
    }
    // Compose serializes literal dollars in extension fields as escaped pairs.
    return (resolved as string[]).map((value) => boundedPathValue(value.replaceAll("$$", "$")));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function scopeDefinitions(scopes: InterpolationScopes, readDefinitions: (file: string) => Promise<EnvDefinitions>) {
  return await Promise.all(scopes.map(async (scope) => {
    const files = await composeInterpolationEnvFiles([scope]);
    const values = new Map<string, string>();
    const declarations: Array<[string, string]> = [];
    for (const file of files) {
      const entries = (await readDefinitions(file)).declarations;
      declarations.push(...entries);
      for (const [name, value] of entries) {
        values.delete(name);
        values.set(name, value);
      }
    }
    return { scope, files, values, declarations };
  }));
}

interface InterpolationToken { end: number; name: string; operator?: string; fallback?: string }

function interpolationClose(expression: string, start: number): number {
  let nested = 0;
  for (let cursor = start; cursor < expression.length; cursor += 1) {
    if (expression[cursor] === "$" && expression[cursor + 1] === "{") { nested += 1; cursor += 1; }
    else if (expression[cursor] === "}" && nested > 0) nested -= 1;
    else if (expression[cursor] === "}") return cursor;
  }
  return -1;
}

function parseInterpolationToken(expression: string, index: number): InterpolationToken | undefined {
  const braced = expression[index + 1] === "{";
  const start = index + (braced ? 2 : 1);
  if (!/[A-Za-z_]/.test(expression[start] ?? "")) return undefined;
  let end = start + 1;
  while (/\w/.test(expression[end] ?? "")) end += 1;
  const name = expression.slice(start, end);
  if (!braced) return { end, name };
  let operator: string | undefined;
  if (expression[end] === ":" && /[-+?]/.test(expression[end + 1] ?? "")) {
    operator = expression.slice(end, end + 2);
    end += 2;
  } else if (/[-+?]/.test(expression[end] ?? "")) operator = expression[end++];
  const close = interpolationClose(expression, end);
  if (close < 0 || (!operator && close !== end)) return undefined;
  return { end: close + 1, name, operator, fallback: operator ? expression.slice(end, close) : undefined };
}

function selectedTokenValue(token: InterpolationToken, values: NodeJS.ProcessEnv, depth: number): string | undefined {
  const value = Object.hasOwn(values, token.name) ? values[token.name] : undefined;
  const unset = value === undefined || (token.operator?.startsWith(":") && value === "");
  if (token.operator?.endsWith("?") && unset) return undefined;
  if (token.operator?.endsWith("-")) {
    return unset ? simpleInterpolation(token.fallback ?? "", values, depth + 1) : value;
  }
  if (token.operator?.endsWith("+")) {
    return unset ? "" : simpleInterpolation(token.fallback ?? "", values, depth + 1);
  }
  return value ?? "";
}

/** Evaluate bounded Compose interpolation locally; leave unsupported syntax to Compose. */
export function simpleInterpolation(expression: string, values: NodeJS.ProcessEnv, depth = 0): string | undefined {
  if (depth > 16) return undefined;
  if (expression.startsWith("'") && expression.endsWith("'")) return boundedPathValue(expression.slice(1, -1));
  if (expression.startsWith('"') && expression.endsWith('"')) {
    const inner = expression.slice(1, -1).replace(/\\\$/g, () => "$$").replace(/\\"/g, '"');
    return simpleInterpolation(inner, values, depth + 1);
  }
  const pieces: string[] = [];
  let bytes = 0;
  for (let index = 0; index < expression.length;) {
    if (expression[index] === "\\" || expression[index] === "'" || expression[index] === '"') return undefined;
    let piece: string | undefined;
    if (expression[index] !== "$") piece = expression[index++];
    else if (expression[index + 1] === "$") { piece = "$"; index += 2; }
    else {
      const token = parseInterpolationToken(expression, index);
      if (!token) return undefined;
      piece = selectedTokenValue(token, values, depth);
      index = token.end;
    }
    if (piece === undefined) return undefined;
    bytes += Buffer.byteLength(piece);
    if (bytes > MAX_PATH_VALUE_BYTES) throw new Error("Compose path interpolation exceeds the value limit");
    pieces.push(piece);
  }
  return pieces.join("");
}

function addPathDependencies(expression: string, pending: Set<string>, needed: Set<string>, forbidden: ReadonlySet<string>, allowCredentialDependencies: boolean): void {
  if (expression.startsWith("'") && expression.endsWith("'")) return;
  for (const dependency of pathInterpolationNames(expression)) {
    if (forbidden.has(dependency) || (!allowCredentialDependencies && isCredentialKey(dependency))) throw new Error("Compose source path interpolates an undeclared host or secret value");
    pending.add(dependency);
    needed.add(dependency);
    if (needed.size > 128) throw new Error("Compose path interpolation exceeds the variable limit");
  }
}

function neededVariables(paths: string[], definitions: Awaited<ReturnType<typeof scopeDefinitions>>,
  environment: NodeJS.ProcessEnv, forbidden: ReadonlySet<string>, allowCredentialDependencies: boolean): Set<string> {
  const pending = new Set(paths.flatMap((item) => [...pathInterpolationNames(item)]));
  const needed = new Set(pending);
  for (const { declarations } of definitions) {
    // Walk assignments backwards: an overwritten value cannot supply the
    // selected path, but an earlier assignment may supply a later expression.
    for (let index = declarations.length - 1; index >= 0; index -= 1) {
      const [name, expression] = declarations[index];
      if (!pending.has(name) || Object.hasOwn(environment, name)) continue;
      pending.delete(name);
      addPathDependencies(expression, pending, needed, forbidden, allowCredentialDependencies);
    }
  }
  return needed;
}

function recordEvaluatedValue(local: Record<string, string>, name: string, value: string, budget: { remaining: number }): void {
  budget.remaining -= Buffer.byteLength(value);
  if (budget.remaining < 0) throw new Error("Compose path interpolation exceeds the aggregate byte limit");
  local[name] = boundedPathValue(value);
}

async function evaluateScope(definition: Awaited<ReturnType<typeof scopeDefinitions>>[number],
  needed: ReadonlySet<string>, prior: NodeJS.ProcessEnv, deadline: number, budget: { remaining: number }): Promise<Record<string, string>> {
  const { scope, files, declarations } = definition;
  const local: Record<string, string> = Object.create(null);
  const unresolved = new Set<string>();
  for (const [name, literal] of declarations) {
    if (!needed.has(name) || Object.hasOwn(prior, name)) continue;
    const dependsOnUnresolved = [...pathInterpolationNames(literal)].some((dependency) => unresolved.has(dependency));
    let value: string | undefined;
    if (!dependsOnUnresolved) {
      value = /^[A-Za-z0-9_./-]+$/.test(literal) ? literal : simpleInterpolation(literal, { ...prior, ...local });
    }
    if (value === undefined) { unresolved.add(name); delete local[name]; }
    else { unresolved.delete(name); recordEvaluatedValue(local, name, value, budget); }
  }
  if (unresolved.size) {
    const names = [...unresolved];
    const values = await interpolateWithCompose(names.map((name) => `\${${name}}`), scope.directory, prior, files, deadline);
    for (const [index, name] of names.entries()) recordEvaluatedValue(local, name, values[index], budget);
  }
  return local;
}

async function evaluatedVariables(needed: ReadonlySet<string>, definitions: Awaited<ReturnType<typeof scopeDefinitions>>,
  environment: NodeJS.ProcessEnv, deadline: number): Promise<Record<string, string>> {
  const evaluated: Record<string, string> = Object.create(null);
  const budget = { remaining: MAX_PATH_EXPANSION_BYTES };
  for (const definition of definitions) {
    Object.assign(evaluated, await evaluateScope(definition, needed, { ...environment, ...evaluated }, deadline, budget));
  }
  return evaluated;
}

function directPathValues(paths: string[], values: NodeJS.ProcessEnv): string[] | undefined {
  const matches = paths.map((item) => /^\$\{([A-Za-z_]\w*)\}$/.exec(item));
  if (matches.some((match) => !match)) return undefined;
  const resolved = matches.map((match) => Object.hasOwn(values, match![1]) ? values[match![1]] : undefined);
  return resolved.every((value): value is string => value !== undefined && !value.includes("$"))
    ? resolved.map(boundedPathValue) : undefined;
}

/** Keep evaluated parent dotenv values ahead of child defaults without exposing them in source files. */
export function createScopedPathInterpolator(environment: NodeJS.ProcessEnv, deadline: number, forbidden: ReadonlySet<string>,
  allowCredentialDependencies = false) {
  const declarations = new Map<string, Promise<EnvDefinitions>>();
  const results = new Map<string, Promise<string[]>>();
  const readDefinitions = async (file: string): Promise<EnvDefinitions> => {
    let pending = declarations.get(file);
    if (!pending) { pending = readComposeEnvDefinitions(file); declarations.set(file, pending); }
    return await pending;
  };
  return async (paths: string[], directory: string, _envFiles: string[] = [], scopes: InterpolationScopes = [{ directory, envFiles: [] }]): Promise<string[]> => {
    if (!paths.some((item) => item.includes("$"))) return paths;
    const key = JSON.stringify([paths, directory, scopes]);
    let pending = results.get(key);
    if (!pending) {
      pending = (async () => {
        const definitions = await scopeDefinitions(scopes, readDefinitions);
        const needed = neededVariables(paths, definitions, environment, forbidden, allowCredentialDependencies);
        const evaluated = await evaluatedVariables(needed, definitions, environment, deadline);
        const selected = directPathValues(paths, { ...environment, ...evaluated });
        if (selected) return selected;
        const locallyResolved = paths.map((item) => simpleInterpolation(item, { ...environment, ...evaluated }));
        if (locallyResolved.every((item): item is string => item !== undefined)) return locallyResolved.map(boundedPathValue);
        const localFiles = await composeInterpolationEnvFiles([scopes.at(-1)!]);
        return await interpolateWithCompose(paths, directory, { ...environment, ...evaluated }, localFiles, deadline);
      })();
      results.set(key, pending);
    }
    return await pending;
  };
}
