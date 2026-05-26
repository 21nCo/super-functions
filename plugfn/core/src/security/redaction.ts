export interface TelemetryRedactionOptions {
  sensitiveKeys?: string[];
}

export class TelemetryRedactionError extends Error {
  readonly code: 'INTERNAL_ERROR' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'INTERNAL_ERROR' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'TelemetryRedactionError';
    this.code = code;
    this.status = code === 'VALIDATION_ERROR' ? 400 : 500;
  }
}

const REDACTED = '[REDACTED]';

const DEFAULT_SENSITIVE_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apitoken',
  'apikey',
  'secret',
  'clientsecret',
  'password',
  'smtpcredential',
  'apppassword',
  'token',
  'messagebody',
  'bodytext',
  'bodyhtml',
  'snippet',
  'rawemail',
  'attachments',
  'emailcontent',
  'mailbody',
]);

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._-]+/i,
  /\b(?:at|rt)_[A-Za-z0-9]+\b/i,
  /\b(?:xox[pbars]|ghp|gho|ya29)_[A-Za-z0-9._-]+\b/i,
  /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
];

export function redactTelemetry<T>(input: T, options: TelemetryRedactionOptions = {}): T {
  const sensitiveKeys = buildSensitiveKeySet(options);
  return redactValue(input, sensitiveKeys) as T;
}

export function redactLogEvent<T>(event: T, options: TelemetryRedactionOptions = {}): T {
  return redactTelemetry(event, options);
}

export function redactMetricDimensions(
  dimensions: Record<string, string | number | boolean | undefined>,
  options: TelemetryRedactionOptions = {}
): Record<string, string | number | boolean> {
  const sensitiveKeys = buildSensitiveKeySet(options);
  const output: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(dimensions)) {
    if (value === undefined) {
      continue;
    }

    if (isSensitiveKey(key, sensitiveKeys)) {
      output[key] = REDACTED;
      continue;
    }

    if (typeof value === 'string' && containsSensitiveValue(value)) {
      output[key] = REDACTED;
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function assertTelemetryRedacted(
  telemetry: unknown,
  options: TelemetryRedactionOptions = {}
): void {
  const sensitiveKeys = buildSensitiveKeySet(options);
  if (hasSensitiveLeak(telemetry, sensitiveKeys)) {
    throw new TelemetryRedactionError('INTERNAL_ERROR', 'sensitive telemetry leak detected');
  }
}

function redactValue(value: unknown, sensitiveKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, sensitiveKeys));
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isSensitiveKey(key, sensitiveKeys)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = redactValue(entry, sensitiveKeys);
    }
    return output;
  }

  if (typeof value === 'string' && containsSensitiveValue(value)) {
    return REDACTED;
  }

  return value;
}

function hasSensitiveLeak(value: unknown, sensitiveKeys: Set<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => hasSensitiveLeak(entry, sensitiveKeys));
  }

  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (isSensitiveKey(key, sensitiveKeys) && entry !== REDACTED) {
        return true;
      }
      if (hasSensitiveLeak(entry, sensitiveKeys)) {
        return true;
      }
    }
    return false;
  }

  if (typeof value === 'string') {
    return containsSensitiveValue(value);
  }

  return false;
}

function containsSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function buildSensitiveKeySet(options: TelemetryRedactionOptions): Set<string> {
  const keySet = new Set(DEFAULT_SENSITIVE_KEYS);
  for (const key of options.sensitiveKeys ?? []) {
    keySet.add(normalizeKey(key));
  }
  return keySet;
}

function isSensitiveKey(key: string, sensitiveKeys: Set<string>): boolean {
  return sensitiveKeys.has(normalizeKey(key));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
