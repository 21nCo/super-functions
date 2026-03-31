import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ProjectConfigStore<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  readonly path: string;
  read(): TConfig;
  write(next: TConfig): void;
  get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey] | undefined;
  set<TKey extends string, TValue>(key: TKey, value: TValue): void;
}

export class InvalidConfigError extends Error {
  readonly filePath: string;
  readonly code = "CLIFN_INVALID_CONFIG";

  constructor(filePath: string, detail: string) {
    super(`Invalid config at ${filePath}: ${detail}`);
    this.name = "InvalidConfigError";
    this.filePath = filePath;
  }
}

const DEFAULT_CONFIG_PATH = join(process.cwd(), "conduct.config.json");

function parseConfig<TConfig extends Record<string, unknown>>(path: string): TConfig {
  if (!existsSync(path)) {
    return {} as TConfig;
  }

  const raw = readFileSync(path, "utf8").trim();
  if (raw.length === 0) {
    return {} as TConfig;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new InvalidConfigError(path, "config root must be a JSON object");
    }
    return parsed as TConfig;
  } catch (error) {
    if (error instanceof InvalidConfigError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new InvalidConfigError(path, message);
  }
}

export function createProjectConfig<TConfig extends Record<string, unknown> = Record<string, unknown>>(
  path = DEFAULT_CONFIG_PATH,
): ProjectConfigStore<TConfig> {
  return {
    path,
    read(): TConfig {
      return parseConfig<TConfig>(path);
    },
    write(next: TConfig): void {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    },
    get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey] | undefined {
      const parsed = parseConfig<TConfig>(path);
      return parsed[key];
    },
    set<TKey extends string, TValue>(key: TKey, value: TValue): void {
      const parsed = parseConfig<Record<string, unknown>>(path);
      parsed[key] = value;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    },
  };
}
