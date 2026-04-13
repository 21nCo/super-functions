export class ConfigError extends Error {
  readonly code: 'ENV_VALUE_INVALID' | 'ENV_VALUE_OUT_OF_RANGE';

  constructor(code: 'ENV_VALUE_INVALID' | 'ENV_VALUE_OUT_OF_RANGE', message: string) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

function validateIntValue(
  key: string,
  value: number,
  options: { min?: number; max?: number }
): number {
  if (!Number.isSafeInteger(value)) {
    throw new ConfigError('ENV_VALUE_INVALID', `${key} must be an integer`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new ConfigError('ENV_VALUE_OUT_OF_RANGE', `${key} must be >= ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new ConfigError('ENV_VALUE_OUT_OF_RANGE', `${key} must be <= ${options.max}`);
  }

  return value;
}

export function readIntEnv(
  key: string,
  options: { defaultValue: number; min?: number; max?: number; env?: NodeJS.ProcessEnv }
): number {
  const env = options.env ?? process.env;
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return validateIntValue(key, options.defaultValue, options);
  }

  const normalized = raw.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new ConfigError('ENV_VALUE_INVALID', `${key} must be an integer`);
  }

  return validateIntValue(key, Number.parseInt(normalized, 10), options);
}

export function readIntEnvOrDefault(
  key: string,
  options: { defaultValue: number; min?: number; max?: number; env?: NodeJS.ProcessEnv }
): number {
  try {
    return readIntEnv(key, options);
  } catch (error) {
    if (!(error instanceof ConfigError)) {
      throw error;
    }
    return validateIntValue(key, options.defaultValue, options);
  }
}

export function readStringEnv(
  key: string,
  options: { defaultValue: string; allowEmpty?: boolean; env?: NodeJS.ProcessEnv }
): string {
  const env = options.env ?? process.env;
  const raw = env[key];
  const validateStringValue = (value: string): string => {
    if (!options.allowEmpty && value.trim().length === 0) {
      throw new ConfigError('ENV_VALUE_INVALID', `${key} must not be empty`);
    }

    return value;
  };

  if (raw === undefined || (!options.allowEmpty && raw === '')) {
    return validateStringValue(options.defaultValue);
  }

  return validateStringValue(raw);
}

export function readBooleanEnv(
  key: string,
  options: { defaultValue: boolean; env?: NodeJS.ProcessEnv }
): boolean {
  const env = options.env ?? process.env;
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return options.defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  throw new ConfigError('ENV_VALUE_INVALID', `${key} must be a boolean-like value`);
}
