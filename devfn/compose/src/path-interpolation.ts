import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { composeInterpolationEnvFiles, pathInterpolationNames, type ComposeSourceInventory } from "./source-files.js";

const execFileAsync = promisify(execFile);
type InterpolationScopes = ComposeSourceInventory["interpolationScopes"];
type EnvDefinitions = Map<string, string> & { declarations: Array<[string, string]> };

export async function readComposeEnvDefinitions(file: string): Promise<EnvDefinitions> {
  const size = (await stat(file)).size;
  if (size > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const content = await readFile(file, "utf8");
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const found = new Map<string, string>() as EnvDefinitions;
  found.declarations = [];
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const line = index === 0 && source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    let cursor = 0;
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    if (line[cursor] === "#" || cursor === line.length) continue;
    if (line.startsWith("export", cursor) && (line[cursor + 6] === " " || line[cursor + 6] === "\t")) {
      cursor += 6;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    }
    const start = cursor;
    if (!/[A-Za-z_]/.test(line[cursor] ?? "")) continue;
    while (/[A-Za-z0-9_]/.test(line[cursor] ?? "")) cursor += 1;
    const name = line.slice(start, cursor);
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    if (line[cursor] !== "=" && line[cursor] !== ":") continue;
    cursor += 1;
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    let end = line.length;
    if (line[cursor] === "'" || line[cursor] === '"') {
      const quote = line[cursor];
      for (let offset = cursor + 1; offset < line.length; offset += 1) {
        if (line[offset] === "\\" && offset + 1 < line.length) { offset += 1; continue; }
        if (line[offset] !== quote) continue;
        if (line.slice(offset + 1).trimStart().startsWith("#")) end = offset + 1;
        break;
      }
    } else {
      for (let offset = cursor + 1; offset < line.length; offset += 1) {
        if (line[offset] === "#" && (line[offset - 1] === " " || line[offset - 1] === "\t")) {
          end = offset;
          break;
        }
      }
    }
    const value = line.slice(cursor, end).trimEnd();
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
    return (resolved as string[]).map((value) => value.replaceAll("$$", "$"));
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

/** Evaluate the simple Compose dotenv grammar locally; leave other forms to Compose. */
function simpleInterpolation(expression: string, values: NodeJS.ProcessEnv): string | undefined {
  let output = "";
  for (let index = 0; index < expression.length;) {
    if (expression[index] === "\\" || expression[index] === "'" || expression[index] === '"') return undefined;
    if (expression[index] !== "$") { output += expression[index++]; continue; }
    if (expression[index + 1] === "$") { output += "$"; index += 2; continue; }
    const braced = expression[index + 1] === "{";
    const start = index + (braced ? 2 : 1);
    if (!/[A-Za-z_]/.test(expression[start] ?? "")) return undefined;
    let end = start + 1;
    while (/[A-Za-z0-9_]/.test(expression[end] ?? "")) end += 1;
    const name = expression.slice(start, end);
    let fallback: string | undefined;
    let operator: string | undefined;
    if (braced) {
      if (expression[end] === ":" && ["-", "+", "?"].includes(expression[end + 1] ?? "")) {
        operator = expression.slice(end, end + 2);
        end += 2;
      } else if (["-", "+", "?"].includes(expression[end] ?? "")) {
        operator = expression[end++];
      }
      if (end !== start + name.length) {
        const close = expression.indexOf("}", end);
        if (close < 0 || expression.slice(end, close).includes("$")) return undefined;
        fallback = expression.slice(end, close);
        end = close;
      }
      if (expression[end] !== "}") return undefined;
      end += 1;
    }
    const value = values[name];
    const unset = value === undefined || (operator?.startsWith(":") && value === "");
    if (operator?.endsWith("?") && unset) return undefined;
    if (operator?.endsWith("-")) output += unset ? fallback ?? "" : value;
    else if (operator?.endsWith("+")) output += unset ? "" : fallback ?? "";
    else output += value ?? "";
    index = end;
  }
  return output;
}

function neededVariables(paths: string[], definitions: Awaited<ReturnType<typeof scopeDefinitions>>,
  environment: NodeJS.ProcessEnv, forbidden: ReadonlySet<string>): Set<string> {
  const needed = new Set(paths.flatMap((item) => [...pathInterpolationNames(item)]));
  const examined = new Set<string>();
  while (needed.size > examined.size) {
    const name = [...needed].find((candidate) => !examined.has(candidate));
    if (!name) break;
    examined.add(name);
    if (examined.size > 128) throw new Error("Compose path interpolation exceeds the variable limit");
    if (Object.hasOwn(environment, name)) continue;
    const expression = definitions.find((scope) => scope.values.has(name))?.values.get(name);
    if (expression === undefined) continue;
    if (expression.startsWith("'") && expression.endsWith("'")) continue;
    for (const dependency of pathInterpolationNames(expression)) {
      if (forbidden.has(dependency)) throw new Error("Compose source path interpolates an undeclared host or secret value");
      needed.add(dependency);
    }
  }
  return needed;
}

async function evaluatedVariables(needed: ReadonlySet<string>, definitions: Awaited<ReturnType<typeof scopeDefinitions>>,
  environment: NodeJS.ProcessEnv, deadline: number): Promise<Record<string, string>> {
  const evaluated: Record<string, string> = {};
  for (const { scope, files, declarations } of definitions) {
    const prior = { ...environment, ...evaluated };
    const local: Record<string, string> = {};
    const unresolved = new Set<string>();
    for (const [name, literal] of declarations) {
      if (!needed.has(name) || Object.hasOwn(prior, name)) continue;
      const dependsOnUnresolved = [...pathInterpolationNames(literal)].some((dependency) => unresolved.has(dependency));
      let value: string | undefined;
      if (!dependsOnUnresolved) {
        value = /^[A-Za-z0-9_./-]+$/.test(literal) ? literal : simpleInterpolation(literal, { ...prior, ...local });
      }
      if (value === undefined) {
        unresolved.add(name);
        delete local[name];
      } else {
        unresolved.delete(name);
        local[name] = value;
      }
    }
    if (unresolved.size) {
      const unresolvedNames = [...unresolved];
      const interpolated = await interpolateWithCompose(unresolvedNames.map((name) => `\${${name}}`), scope.directory,
        prior, files, deadline);
      for (const [index, name] of unresolvedNames.entries()) local[name] = interpolated[index];
    }
    Object.assign(evaluated, local);
  }
  return evaluated;
}

function directPathValues(paths: string[], values: NodeJS.ProcessEnv): string[] | undefined {
  const matches = paths.map((item) => /^\$\{([A-Za-z_]\w*)\}$/.exec(item));
  if (matches.some((match) => !match)) return undefined;
  const resolved = matches.map((match) => values[match![1]]);
  return resolved.every((value): value is string => value !== undefined && !value.includes("$")) ? resolved : undefined;
}

/** Keep evaluated parent dotenv values ahead of child defaults without exposing them in source files. */
export function createScopedPathInterpolator(environment: NodeJS.ProcessEnv, deadline: number, forbidden: ReadonlySet<string>) {
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
        const needed = neededVariables(paths, definitions, environment, forbidden);
        const evaluated = await evaluatedVariables(needed, definitions, environment, deadline);
        const selected = directPathValues(paths, { ...environment, ...evaluated });
        if (selected) return selected;
        const locallyResolved = paths.map((item) => simpleInterpolation(item, { ...environment, ...evaluated }));
        if (locallyResolved.every((item): item is string => item !== undefined)) return locallyResolved;
        const localFiles = await composeInterpolationEnvFiles([scopes.at(-1)!]);
        return await interpolateWithCompose(paths, directory, { ...environment, ...evaluated }, localFiles, deadline);
      })();
      results.set(key, pending);
    }
    return await pending;
  };
}
