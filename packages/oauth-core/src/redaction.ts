const REDACTED = "[REDACTED]";

const SECRET_KEYS = new Set([
  "api_key",
  "authorization",
  "authorization_code",
  "bearer",
  "client_secret",
  "code_verifier",
  "cookie",
  "credential",
  "credentials",
  "nonce",
  "oauth_state",
  "password",
  "pkce",
  "pkce_verifier",
  "secret",
  "session",
  "session_id",
  "state",
  "token",
]);
const EMBEDDED_URL = /\b[a-z][a-z0-9+.-]*:\/{1,2}[^\s<>"']+/gi;
const KEY_VALUE_ASSIGNMENT =
  /(\b([a-z][a-z0-9_-]*)\b["']?\s*(?:=|:)\s*)(["']?)([^"'\s,;&#]+)\3/gi;

export interface OAuthRedactionOptions {
  maxDepth?: number;
  maxArrayEntries?: number;
  maxStringLength?: number;
}

/**
 * Redacts OAuth/session credentials and bounds diagnostic values before they
 * reach logs, CLI reports, test artifacts, or inspector event streams.
 */
export function redactOAuthValue<T>(
  value: T,
  options: OAuthRedactionOptions = {},
): T {
  return redact(value, {
    maxDepth: options.maxDepth ?? 8,
    maxArrayEntries: options.maxArrayEntries ?? 100,
    maxStringLength: options.maxStringLength ?? 2_048,
  }, 0, new WeakSet()) as T;
}

function redact(
  value: unknown,
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (depth > options.maxDepth) return "[TRUNCATED]";
  if (typeof value === "string") {
    return redactString(value, options.maxStringLength);
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof URL) return redactUrl(value, options.maxStringLength);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (ancestors.has(value)) return "[CIRCULAR]";
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = value
        .slice(0, options.maxArrayEntries)
        .map((entry) => redact(entry, options, depth + 1, ancestors));
      if (value.length > options.maxArrayEntries) entries.push("[TRUNCATED]");
      return entries;
    }
    if (value instanceof Map) {
      const entries = [...value.entries()]
        .slice(0, options.maxArrayEntries)
        .map(([key, entry]) => [
          redact(key, options, depth + 1, ancestors),
          typeof key === "string" && isSecretKey(key)
            ? REDACTED
            : redact(entry, options, depth + 1, ancestors),
        ]);
      if (value.size > options.maxArrayEntries) entries.push(["[TRUNCATED]", "[TRUNCATED]"]);
      return { type: "Map", entries };
    }
    if (value instanceof Set) {
      const values = [...value.values()]
        .slice(0, options.maxArrayEntries)
        .map((entry) => redact(entry, options, depth + 1, ancestors));
      if (value.size > options.maxArrayEntries) values.push("[TRUNCATED]");
      return { type: "Set", values };
    }
    const enumerable = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSecretKey(key) ? REDACTED : redact(entry, options, depth + 1, ancestors),
      ]),
    );
    if (value instanceof Error) {
      return {
        ...enumerable,
        name: redactString(value.name, options.maxStringLength),
        message: redactString(value.message, options.maxStringLength),
        ...(value.stack
          ? { stack: redactString(value.stack, options.maxStringLength) }
          : {}),
      };
    }
    return enumerable;
  } finally {
    ancestors.delete(value);
  }
}

function maybeRedactUrl(value: string, maxLength: number): string | undefined {
  if (!/^[a-z][a-z0-9+.-]*:\//i.test(value)) return undefined;
  try {
    return redactUrl(new URL(value), maxLength);
  } catch {
    return undefined;
  }
}

function redactUrl(url: URL, maxLength: number): string {
  const copy = new URL(url.toString());
  for (const key of copy.searchParams.keys()) {
    if (isSensitiveUrlKey(key)) copy.searchParams.set(key, REDACTED);
  }
  if (copy.hash.length > 1) {
    const fragment = copy.hash.slice(1);
    const parameters = new URLSearchParams(fragment);
    let changed = false;
    for (const key of parameters.keys()) {
      if (!isSensitiveUrlKey(key)) continue;
      parameters.set(key, REDACTED);
      changed = true;
    }
    if (changed) copy.hash = parameters.toString();
  }
  copy.username = "";
  copy.password = "";
  const serialized = copy.toString();
  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength)}…`
    : serialized;
}

function redactString(value: string, maxLength: number): string {
  const redactedUrl = maybeRedactUrl(value, maxLength);
  if (redactedUrl !== undefined) return redactedUrl;
  const redacted = value
    .replace(EMBEDDED_URL, (candidate) => maybeRedactUrl(candidate, maxLength) ?? candidate)
    .replace(
      KEY_VALUE_ASSIGNMENT,
      (match, prefix: string, key: string, quote: string) =>
        isSensitiveUrlKey(key) ? `${prefix}${quote}${REDACTED}${quote}` : match,
    );
  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength)}…`
    : redacted;
}

function isSensitiveUrlKey(key: string): boolean {
  return normalizeKey(key) === "code" || isSecretKey(key);
}

function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SECRET_KEYS.has(normalized) ||
    normalized.endsWith("_token") ||
    normalized.endsWith("_password") ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_authorization") ||
    normalized.endsWith("_cookie") ||
    normalized.endsWith("_credential") ||
    normalized.endsWith("_credentials");
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
