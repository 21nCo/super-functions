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

function quotedEnvDefinitionEnd(line: string, start: number, quote: string): number {
  for (let cursor = start + 1; cursor < line.length; cursor += 1) {
    if (line[cursor] === "\\" && cursor + 1 < line.length) { cursor += 1; continue; }
    if (line[cursor] === quote) return line.slice(cursor + 1).trimStart().startsWith("#") ? cursor + 1 : line.length;
  }
  return line.length;
}

function envDefinitionEnd(line: string, start: number): number {
  const quote = line[start];
  if (quote === "'" || quote === '"') return quotedEnvDefinitionEnd(line, start, quote);
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
  // A dotenv file may contain large ordinary values. Apply the path limit
  // only after a value is selected for a source path.
  return [name, line.slice(cursor, envDefinitionEnd(line, cursor)).trimEnd()];
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

/** References whose values contribute to the active Compose interpolation branch. */
function selectedTokenReferences(token: InterpolationToken, values: NodeJS.ProcessEnv,
  options: { includeConditions?: boolean; strictMissing?: boolean }, depth: number): Set<string> {
  const selected = new Set<string>();
  const value = Object.hasOwn(values, token.name) ? values[token.name] : undefined;
  const unset = value === undefined || (token.operator?.startsWith(":") && value === "");
  const alternative = token.operator?.endsWith("-") && unset || token.operator?.endsWith("+") && !unset;
  if (alternative) {
    for (const name of selectedInterpolationReferences(token.fallback ?? "", values, options, depth + 1)) selected.add(name);
  } else if (!token.operator?.endsWith("+") && !token.operator?.endsWith("-")) {
    selected.add(token.name);
    if (unset && options.strictMissing) throw new Error("Compose source path contains a missing selected reference");
  } else if (!unset) selected.add(token.name);
  if (options.includeConditions && token.operator && /[-+]$/.test(token.operator)) selected.add(token.name);
  return selected;
}

export function selectedInterpolationReferences(expression: string, values: NodeJS.ProcessEnv,
  options: { includeConditions?: boolean; strictMissing?: boolean } = {}, depth = 0): Set<string> {
  if (depth > 128) throw new Error("Compose interpolation exceeds the nesting limit");
  const selected = new Set<string>();
  if (expression.startsWith("'") && expression.endsWith("'")) return selected;
  for (let index = 0; index < expression.length;) {
    if (expression[index] !== "$" || expression[index + 1] === "$") {
      index += expression[index] === "$" && expression[index + 1] === "$" ? 2 : 1;
      continue;
    }
    const token = parseInterpolationToken(expression, index);
    if (!token) {
      for (const name of pathInterpolationNames(expression.slice(index))) selected.add(name);
      break;
    }
    for (const name of selectedTokenReferences(token, values, options, depth)) selected.add(name);
    index = token.end;
  }
  return selected;
}

function selectedTokenValue(token: InterpolationToken, values: NodeJS.ProcessEnv, depth: number, maxBytes: number): string | undefined {
  const value = Object.hasOwn(values, token.name) ? values[token.name] : undefined;
  const unset = value === undefined || (token.operator?.startsWith(":") && value === "");
  if (token.operator?.endsWith("?") && unset) return undefined;
  if (token.operator?.endsWith("-")) {
    return unset ? simpleInterpolation(token.fallback ?? "", values, depth + 1, maxBytes) : value;
  }
  if (token.operator?.endsWith("+")) {
    return unset ? "" : simpleInterpolation(token.fallback ?? "", values, depth + 1, maxBytes);
  }
  // An unresolved bare reference must not silently select a different file.
  return value;
}

function interpolatePieces(expression: string, values: NodeJS.ProcessEnv, depth: number, maxBytes: number): string | undefined {
  const pieces: string[] = [];
  let bytes = 0;
  for (let index = 0; index < expression.length;) {
    let piece: string | undefined;
    if (expression[index] !== "$") piece = expression[index++];
    else if (expression[index + 1] === "$") { piece = "$"; index += 2; }
    else {
      const token = parseInterpolationToken(expression, index);
      if (!token) return undefined;
      piece = selectedTokenValue(token, values, depth, maxBytes);
      index = token.end;
    }
    if (piece === undefined) return undefined;
    bytes += Buffer.byteLength(piece);
    if (bytes > maxBytes) throw new Error("Compose interpolation exceeds the value limit");
    pieces.push(piece);
  }
  return pieces.join("");
}

function decodeDoubleQuoted(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\" || index + 1 >= value.length) { decoded += value[index]; continue; }
    const escaped = value[++index];
    if (escaped === "$") decoded += "$$";
    else if (escaped === "n") decoded += "\n";
    else if (escaped === "r") decoded += "\r";
    else if (escaped === "t") decoded += "\t";
    else if (escaped === "\\" || escaped === '"') decoded += escaped;
    else decoded += `\\${escaped}`;
  }
  return decoded;
}

/** Evaluate bounded Compose interpolation locally; leave unsupported syntax to Compose. */
export function simpleInterpolation(expression: string, values: NodeJS.ProcessEnv, depth = 0,
  maxBytes = MAX_PATH_VALUE_BYTES): string | undefined {
  if (depth > 128) return undefined;
  if (!expression.includes("$") && !/[\\'\"]/.test(expression)) {
    if (Buffer.byteLength(expression) > maxBytes) throw new Error("Compose interpolation exceeds the value limit");
    return expression;
  }
  if (expression.startsWith("'") && expression.endsWith("'")) {
    const literal = expression.slice(1, -1);
    if (Buffer.byteLength(literal) > maxBytes) throw new Error("Compose interpolation exceeds the value limit");
    return literal;
  }
  if (expression.startsWith('"') && expression.endsWith('"')) {
    const inner = decodeDoubleQuoted(expression.slice(1, -1));
    return simpleInterpolation(inner, values, depth + 1, maxBytes);
  }
  return interpolatePieces(expression, values, depth, maxBytes);
}

function selectedDeclaration(definitions: Awaited<ReturnType<typeof scopeDefinitions>>, name: string,
  scopeLimit: number, declarationLimit: number): { scope: number; index: number; expression: string } | undefined {
  for (let scope = 0; scope <= scopeLimit; scope += 1) {
    const declarations = definitions[scope].declarations;
    const limit = scope === scopeLimit ? declarationLimit : declarations.length;
    for (let index = limit - 1; index >= 0; index -= 1) {
      if (declarations[index][0] === name) return { scope, index, expression: declarations[index][1] };
    }
  }
  return undefined;
}

function neededVariables(paths: string[], definitions: Awaited<ReturnType<typeof scopeDefinitions>>,
  environment: NodeJS.ProcessEnv, forbidden: ReadonlySet<string>, allowCredentialDependencies: boolean): Set<string> {
  const needed = new Set<string>();
  const inspected = new Set<string>();
  const visit = (name: string, scopeLimit: number, declarationLimit: number): void => {
    if (forbidden.has(name) || (!allowCredentialDependencies && isCredentialKey(name))) {
      throw new Error("Compose source path interpolates an undeclared host or secret value");
    }
    needed.add(name);
    if (needed.size > 128) throw new Error("Compose path interpolation exceeds the variable limit");
    if (Object.hasOwn(environment, name)) return;
    const selected = selectedDeclaration(definitions, name, scopeLimit, declarationLimit);
    if (!selected) return;
    const identity = `${selected.scope}:${selected.index}`;
    if (inspected.has(identity)) return;
    inspected.add(identity);
    if (selected.expression.startsWith("'") && selected.expression.endsWith("'")) return;
    for (const dependency of pathInterpolationNames(selected.expression)) visit(dependency, selected.scope, selected.index);
  };
  for (const item of paths) for (const name of pathInterpolationNames(item)) {
    visit(name, definitions.length - 1, definitions.at(-1)?.declarations.length ?? 0);
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
    if (value === undefined) {
      selectedInterpolationReferences(literal, { ...prior, ...local }, { strictMissing: true });
      unresolved.add(name);
      delete local[name];
    }
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
        for (const item of paths) selectedInterpolationReferences(item, { ...environment, ...evaluated }, { strictMissing: true });
        const localFiles = await composeInterpolationEnvFiles([scopes.at(-1)!]);
        return await interpolateWithCompose(paths, directory, { ...environment, ...evaluated }, localFiles, deadline);
      })();
      results.set(key, pending);
    }
    return await pending;
  };
}
