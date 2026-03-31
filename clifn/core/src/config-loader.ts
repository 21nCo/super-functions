import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const DEFAULT_CANDIDATES = [
  "config.ts",
  "config.js",
  "config.mjs",
  "config.cjs",
  "config.json",
] as const;

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".json"]);

export type ConfigLoaderErrorCode =
  | "CLIFN_CONFIG_INVALID"
  | "CLIFN_CONFIG_NOT_FOUND"
  | "CLIFN_CONFIG_UNSUPPORTED";

export class ConfigLoaderError extends Error {
  readonly code: ConfigLoaderErrorCode;

  constructor(code: ConfigLoaderErrorCode, message: string) {
    super(message);
    this.name = "ConfigLoaderError";
    this.code = code;
  }
}

export interface ConfigLoaderOptions<T> {
  cwd?: string;
  configPath?: string;
  candidates?: readonly string[];
  exportNames?: readonly string[];
  validate?: (value: unknown, path: string) => T;
}

export interface LoadedConfig<T> {
  config: T;
  path: string;
}

function isRemotePath(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function ensureLocalPath(value: string): void {
  if (isRemotePath(value)) {
    throw new ConfigLoaderError("CLIFN_CONFIG_NOT_FOUND", "Remote config URLs are not supported.");
  }
}

function resolveCandidates(options: ConfigLoaderOptions<unknown>): readonly string[] {
  if (options.configPath) {
    return [options.configPath];
  }

  const candidates = options.candidates && options.candidates.length > 0 ? [...options.candidates] : [...DEFAULT_CANDIDATES];
  if (candidates.length > 32) {
    throw new ConfigLoaderError("CLIFN_CONFIG_INVALID", "Config candidate list exceeds the limit of 32 entries.");
  }
  return candidates;
}

async function resolveConfigValue(value: unknown): Promise<unknown> {
  const resolved = typeof value === "function" ? value() : value;
  return await Promise.resolve(resolved);
}

function resolveExportValue(moduleValue: unknown, exportNames: readonly string[]): unknown {
  if (moduleValue && typeof moduleValue === "object") {
    const record = moduleValue as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    const looksLikeModuleWrapper = record.__esModule === true || prototype === null || prototype !== Object.prototype;

    if (!looksLikeModuleWrapper) {
      return moduleValue;
    }

    if (record.default !== undefined) {
      return record.default;
    }

    for (const exportName of exportNames) {
      if (record[exportName] !== undefined) {
        return record[exportName];
      }
    }
  }

  return moduleValue;
}

async function loadJsonConfig(resolvedPath: string): Promise<unknown> {
  try {
    const raw = await readFile(resolvedPath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON config";
    throw new ConfigLoaderError("CLIFN_CONFIG_INVALID", message);
  }
}

async function loadModuleConfig(resolvedPath: string): Promise<unknown> {
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new ConfigLoaderError(
      "CLIFN_CONFIG_UNSUPPORTED",
      `Unsupported config extension: ${extension || "<none>"}`
    );
  }

  if (extension === ".json") {
    return loadJsonConfig(resolvedPath);
  }

  if (extension === ".ts") {
    const jiti = createJiti(path.dirname(resolvedPath), {
      moduleCache: false,
      interopDefault: false,
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
    });
    return await jiti.import(resolvedPath);
  }

  return import(pathToFileURL(resolvedPath).href);
}

export function defineConfig<T>(config: T): T {
  return config;
}

export async function loadConfig<T>(options: ConfigLoaderOptions<T> = {}): Promise<LoadedConfig<T>> {
  const cwd = options.cwd ?? process.cwd();
  const candidates = resolveCandidates(options);
  const exportNames = options.exportNames ?? [];

  for (const candidate of candidates) {
    ensureLocalPath(candidate);

    const resolvedPath = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
    if (!existsSync(resolvedPath)) {
      continue;
    }

    try {
      const loadedModule = await loadModuleConfig(resolvedPath);
      const configValue = await resolveConfigValue(resolveExportValue(loadedModule, exportNames));
      const validated = options.validate ? options.validate(configValue, resolvedPath) : (configValue as T);
      return {
        config: validated,
        path: resolvedPath,
      };
    } catch (error) {
      if (error instanceof ConfigLoaderError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : `Config loading failed for ${resolvedPath}`;
      throw new ConfigLoaderError("CLIFN_CONFIG_INVALID", message);
    }
  }

  if (options.configPath) {
    throw new ConfigLoaderError("CLIFN_CONFIG_NOT_FOUND", `Config file not found: ${options.configPath}`);
  }

  throw new ConfigLoaderError(
    "CLIFN_CONFIG_NOT_FOUND",
    `Config file not found. Checked: ${candidates.join(", ")}`
  );
}
