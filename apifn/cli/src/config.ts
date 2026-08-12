import { existsSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";

export interface ApifnConfig {
  openapi?: {
    info?: {
      title?: string;
      version?: string;
      description?: string;
      termsOfService?: string;
      contact?: { name?: string; url?: string; email?: string };
      license?: { name: string; url?: string };
    };
    servers?: Array<{ url: string; description?: string }>;
  };
  router?: string;
  collection?: string;
  output?: string;
  defaultEnvironment?: string;
  watchfn?: { url?: string };
  diff?: { failOnBreaking?: boolean; ignoreExtensions?: boolean };
  snippets?: string[];
}

const DEFAULT_CONFIG_FILE = "apifn.config.ts";

export function defineConfig(config: ApifnConfig): ApifnConfig {
  return config;
}

function ensureString(value: unknown, pathLabel: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${pathLabel} must be a string`);
  }
}

function ensureBoolean(value: unknown, pathLabel: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${pathLabel} must be a boolean`);
  }
}

function ensureStringArray(value: unknown, pathLabel: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some((v) => typeof v !== "string"))) {
    throw new Error(`${pathLabel} must be a string[]`);
  }
}

function validateConfig(raw: unknown): ApifnConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Config must export an object");
  }

  const config = raw as Record<string, unknown>;
  const allowed = new Set([
    "openapi",
    "router",
    "collection",
    "output",
    "defaultEnvironment",
    "watchfn",
    "diff",
    "snippets",
  ]);

  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown config field: ${key}`);
    }
  }

  ensureString(config.router, "router");
  ensureString(config.collection, "collection");
  ensureString(config.output, "output");
  ensureString(config.defaultEnvironment, "defaultEnvironment");

  if (config.openapi !== undefined) {
    if (!config.openapi || typeof config.openapi !== "object" || Array.isArray(config.openapi)) {
      throw new Error("openapi must be an object");
    }

    const openapi = config.openapi as Record<string, unknown>;
    if (openapi.info !== undefined) {
      if (!openapi.info || typeof openapi.info !== "object" || Array.isArray(openapi.info)) {
        throw new Error("openapi.info must be an object");
      }
      const info = openapi.info as Record<string, unknown>;
      ensureString(info.title, "info.title");
      ensureString(info.version, "info.version");
      ensureString(info.description, "info.description");
      ensureString(info.termsOfService, "info.termsOfService");
    }

    if (openapi.servers !== undefined) {
      if (!Array.isArray(openapi.servers)) {
        throw new Error("openapi.servers must be an array");
      }
      for (const [index, server] of openapi.servers.entries()) {
        if (!server || typeof server !== "object" || Array.isArray(server)) {
          throw new Error(`openapi.servers[${index}] must be an object`);
        }
        const serverRecord = server as Record<string, unknown>;
        ensureString(serverRecord.url, `openapi.servers[${index}].url`);
        ensureString(serverRecord.description, `openapi.servers[${index}].description`);
      }
    }
  }

  if (config.watchfn !== undefined) {
    if (!config.watchfn || typeof config.watchfn !== "object" || Array.isArray(config.watchfn)) {
      throw new Error("watchfn must be an object");
    }
    ensureString((config.watchfn as Record<string, unknown>).url, "watchfn.url");
  }

  if (config.diff !== undefined) {
    if (!config.diff || typeof config.diff !== "object" || Array.isArray(config.diff)) {
      throw new Error("diff must be an object");
    }
    const diff = config.diff as Record<string, unknown>;
    ensureBoolean(diff.failOnBreaking, "diff.failOnBreaking");
    ensureBoolean(diff.ignoreExtensions, "diff.ignoreExtensions");
  }

  ensureStringArray(config.snippets, "snippets");

  return config as ApifnConfig;
}

export async function loadConfig(options?: {
  cwd?: string;
  configPath?: string;
}): Promise<{ config: ApifnConfig; path?: string }> {
  const cwd = options?.cwd ?? process.cwd();
  const configuredPath = options?.configPath;
  const candidates = configuredPath
    ? [configuredPath]
    : ["apifn.config.ts", "apifn.config.js", "apifn.config.mjs"];

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
    if (!existsSync(resolved)) {
      continue;
    }

    const jiti = createJiti(process.cwd(), { moduleCache: false });
    const loaded = (await jiti.import(resolved)) as { default?: unknown };
    const configValue = loaded?.default ?? loaded;
    return { config: validateConfig(configValue), path: resolved };
  }

  if (configuredPath) {
    throw new Error(`Config file not found: ${configuredPath}`);
  }

  return { config: {}, path: undefined };
}

export const DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_FILE;
