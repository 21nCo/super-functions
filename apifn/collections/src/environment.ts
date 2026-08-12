import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import type { Environment } from "./types.js";

function isYaml(fileName: string): boolean {
  return fileName.endsWith(".yml") || fileName.endsWith(".yaml");
}

export async function readEnvironmentFile(filePath: string): Promise<Environment> {
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid environment YAML in ${filePath}`);
  }

  const fileName = path.basename(filePath, path.extname(filePath));
  const name = typeof parsed.name === "string" ? parsed.name : fileName;
  const variables = parsed.variables;

  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error(`Environment variables are required in ${filePath}`);
  }

  return {
    name,
    variables: Object.fromEntries(
      Object.entries(variables as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ])
    ),
  };
}

export async function writeEnvironmentFile(
  filePath: string,
  environment: Environment
): Promise<void> {
  const payload = {
    name: environment.name,
    variables: environment.variables,
  };

  await writeFile(filePath, toYaml(payload), "utf8");
}

export async function readEnvironments(envDir: string): Promise<Record<string, Environment>> {
  const entries = await readdir(envDir, { withFileTypes: true });
  const result: Record<string, Environment> = {};

  for (const entry of entries) {
    if (!entry.isFile() || !isYaml(entry.name)) {
      continue;
    }

    const filePath = path.join(envDir, entry.name);
    const environment = await readEnvironmentFile(filePath);
    const key = path.basename(entry.name, path.extname(entry.name));
    if (result[key]) {
      throw new Error(`Duplicate environment key '${key}' in ${envDir}`);
    }
    result[key] = environment;
  }

  return result;
}

export async function writeEnvironments(
  envDir: string,
  environments: Record<string, Environment>
): Promise<void> {
  for (const [name, environment] of Object.entries(environments)) {
    const filePath = path.join(envDir, `${name}.yml`);
    await writeEnvironmentFile(filePath, environment);
  }
}

export function selectEnvironment(
  environments: Record<string, Environment>,
  name: string
): Environment {
  const environment = environments[name];
  if (!environment) {
    throw new Error(`Environment '${name}' not found`);
  }

  return environment;
}
