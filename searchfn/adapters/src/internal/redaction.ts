const KEY_VALUE_SECRET = /\b(api[_-]?key|password|secret|token|authorization|connection(?:string|[_-]?string)?)\s*[:=]\s*([^\s,;]+)/gi;
const URL_CREDENTIALS = /(https?:\/\/)([^\s/@]+)@/gi;
const POSTGRES_CREDENTIALS = /(postgres(?:ql)?:\/\/)([^\s/@]+)@/gi;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    /(api[_-]?key|password|secret|token|authorization)/.test(lower) ||
    /connection(?:string|[_-]?string)?$/.test(lower)
  );
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactSensitiveString(input: string): string {
  return input
    .replace(KEY_VALUE_SECRET, (_match, key) => `${key}=[REDACTED]`)
    .replace(URL_CREDENTIALS, "$1[REDACTED]@")
    .replace(POSTGRES_CREDENTIALS, "$1[REDACTED]@");
}

function redactError(error: Error, seen: WeakSet<object>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    name: error.name,
    message: redactSensitiveString(error.message),
  };
  if (typeof error.stack === "string") {
    output.stack = redactSensitiveString(error.stack);
  }
  if ("cause" in error && (error as Error & { cause?: unknown }).cause !== undefined) {
    output.cause = redactSensitiveInternal(
      (error as Error & { cause?: unknown }).cause,
      seen,
    );
  }
  for (const [key, entry] of Object.entries(error)) {
    if (key === "cause") {
      continue;
    }
    output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveInternal(entry, seen);
  }
  return output;
}

function redactSensitiveInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((entry) => redactSensitiveInternal(entry, seen));
      }
      if (value instanceof Error) {
        return redactError(value, seen);
      }
      const entries = Object.entries(value);
      if (!isPlainObject(value) && entries.length === 0) {
        return value;
      }
      const output: Record<string, unknown> = {};
      for (const [key, entry] of entries) {
        output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveInternal(entry, seen);
      }
      return output;
    } finally {
      seen.delete(value);
    }
  }

  if (typeof value === "string") {
    return redactSensitiveString(value);
  }

  return value;
}

export function redactSensitive(value: unknown): unknown {
  return redactSensitiveInternal(value, new WeakSet<object>());
}
