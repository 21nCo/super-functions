import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { composeInterpolationEnvFiles, pathInterpolationNames, type ComposeSourceInventory } from "./source-files.js";

const execFileAsync = promisify(execFile);
type InterpolationScopes = ComposeSourceInventory["interpolationScopes"];

export async function readComposeEnvDefinitions(file: string): Promise<Map<string, string>> {
  const size = (await stat(file)).size;
  if (size > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const content = await readFile(file, "utf8");
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new Error("Compose interpolation env file exceeds the byte limit");
  const found = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^\uFEFF?\s*(?:export[ \t]+)?([A-Za-z_]\w*)[ \t]*(?:=|:)[ \t]*(.*)$/.exec(line);
    if (match) found.set(match[1], match[2]);
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
    return resolved as string[];
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function scopeDefinitions(scopes: InterpolationScopes, readDefinitions: (file: string) => Promise<Map<string, string>>) {
  return await Promise.all(scopes.map(async (scope) => {
    const files = await composeInterpolationEnvFiles([scope]);
    const values = new Map<string, string>();
    for (const file of files) for (const [name, value] of await readDefinitions(file)) values.set(name, value);
    return { scope, files, values };
  }));
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
  for (const { scope, files, values: declarations } of definitions) {
    const names = [...needed].filter((name) => !Object.hasOwn(environment, name) && !Object.hasOwn(evaluated, name) && declarations.has(name));
    const dynamic: string[] = [];
    for (const name of names) {
      const literal = declarations.get(name)!;
      if (/^[A-Za-z0-9_./-]+$/.test(literal)) evaluated[name] = literal;
      else dynamic.push(name);
    }
    if (dynamic.length) {
      const interpolated = await interpolateWithCompose(dynamic.map((name) => `\${${name}}`), scope.directory,
        { ...environment, ...evaluated }, files, deadline);
      for (const [index, name] of dynamic.entries()) evaluated[name] = interpolated[index];
    }
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
  const declarations = new Map<string, Promise<Map<string, string>>>();
  const results = new Map<string, Promise<string[]>>();
  const readDefinitions = async (file: string): Promise<Map<string, string>> => {
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
        const localFiles = await composeInterpolationEnvFiles([scopes.at(-1)!]);
        return await interpolateWithCompose(paths, directory, { ...environment, ...evaluated }, localFiles, deadline);
      })();
      results.set(key, pending);
    }
    return await pending;
  };
}
