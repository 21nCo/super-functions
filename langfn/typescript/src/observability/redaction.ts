const DEFAULT_REDACTION_KEYS = [
  "apiKey",
  "api_key",
  "authorization",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "token",
  "password",
  "clientSecret",
  "client_secret",
  "secret",
  "privateKey",
  "private_key",
  "email",
  "ssn"
];

export interface RedactionOptions {
  keys?: Iterable<string>;
}

export function redact<T>(value: T, options: RedactionOptions = {}): T {
  const keyset = new Set(
    [...DEFAULT_REDACTION_KEYS, ...(options.keys ? Array.from(options.keys) : [])].map(normalizeKey)
  );
  return redactValue(value, keyset) as T;
}

function redactValue(value: unknown, keyset: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, keyset));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = keyset.has(normalizeKey(key)) ? "***REDACTED***" : redactValue(nested, keyset);
    }
    return output;
  }

  return value;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
