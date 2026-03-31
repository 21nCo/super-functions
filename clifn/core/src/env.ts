export type EnvErrorCode = "CLIFN_ENV_INVALID" | "CLIFN_ENV_MISSING" | "CLIFN_ENV_OUT_OF_RANGE";

class EnvError extends Error {
  readonly code: EnvErrorCode;

  constructor(code: EnvErrorCode, message: string) {
    super(message);
    this.name = "EnvError";
    this.code = code;
  }
}

export interface StringEnvOptions {
  defaultValue?: string;
  allowEmpty?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface IntEnvOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
  env?: NodeJS.ProcessEnv;
}

export interface BooleanEnvOptions {
  defaultValue?: boolean;
  env?: NodeJS.ProcessEnv;
}

function getEnvValue(key: string, env?: NodeJS.ProcessEnv): string | undefined {
  return (env ?? process.env)[key];
}

export function readRequiredStringEnv(key: string, options: Omit<StringEnvOptions, "defaultValue"> = {}): string {
  const raw = getEnvValue(key, options.env);
  if (raw === undefined || (!options.allowEmpty && raw.trim().length === 0)) {
    throw new EnvError("CLIFN_ENV_MISSING", `${key} is required`);
  }
  return raw;
}

export function readStringEnv(key: string, options: StringEnvOptions = {}): string {
  const raw = getEnvValue(key, options.env);
  if (raw === undefined) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new EnvError("CLIFN_ENV_MISSING", `${key} is required`);
  }

  if (!options.allowEmpty && raw.trim().length === 0) {
    throw new EnvError("CLIFN_ENV_INVALID", `${key} must not be empty`);
  }

  return raw;
}

export function readIntEnv(key: string, options: IntEnvOptions = {}): number {
  const raw = getEnvValue(key, options.env);
  if (raw === undefined || raw === "") {
    if (options.defaultValue !== undefined) {
      return validateInt(key, options.defaultValue, options);
    }
    throw new EnvError("CLIFN_ENV_MISSING", `${key} is required`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== raw.trim()) {
    throw new EnvError("CLIFN_ENV_INVALID", `${key} must be an integer`);
  }

  return validateInt(key, parsed, options);
}

export function readBooleanEnv(key: string, options: BooleanEnvOptions = {}): boolean {
  const raw = getEnvValue(key, options.env);
  if (raw === undefined || raw === "") {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new EnvError("CLIFN_ENV_MISSING", `${key} is required`);
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new EnvError("CLIFN_ENV_INVALID", `${key} must be a boolean-like value`);
}

function validateInt(key: string, value: number, options: IntEnvOptions): number {
  if (!Number.isInteger(value)) {
    throw new EnvError("CLIFN_ENV_INVALID", `${key} must be an integer`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new EnvError("CLIFN_ENV_OUT_OF_RANGE", `${key} must be >= ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new EnvError("CLIFN_ENV_OUT_OF_RANGE", `${key} must be <= ${options.max}`);
  }

  return value;
}
