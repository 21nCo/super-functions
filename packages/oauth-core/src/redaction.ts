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
  /(\b([a-z][a-z0-9_-]*)\b["']?\s*[=:]\s*)(["']?)([^"'\s,;&#]+)\3/gi;

export interface OAuthRedactionOptions {
  maxDepth?: number;
  maxArrayEntries?: number;
  maxObjectEntries?: number;
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
    maxArrayEntries: normalizeEntryLimit(
      options.maxArrayEntries ?? 100,
      "maxArrayEntries",
    ),
    maxObjectEntries: normalizeEntryLimit(
      options.maxObjectEntries ?? 100,
      "maxObjectEntries",
    ),
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
    return redactObject(value, options, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function redactObject(
  value: object,
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) return redactArray(value, options, depth, ancestors);
  if (value instanceof Map) return redactMap(value, options, depth, ancestors);
  if (value instanceof Set) return redactSet(value, options, depth, ancestors);
  const enumerable = redactRecord(value as Record<string, unknown>, options, depth, ancestors);
  return value instanceof Error
    ? redactError(value, enumerable, options.maxStringLength)
    : enumerable;
}

function redactArray(
  value: unknown[],
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): unknown[] {
  const entries = value
    .slice(0, options.maxArrayEntries)
    .map((entry) => redact(entry, options, depth + 1, ancestors));
  if (value.length > options.maxArrayEntries) entries.push("[TRUNCATED]");
  return entries;
}

function redactMap(
  value: Map<unknown, unknown>,
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): { type: "Map"; entries: unknown[][] } {
  const entries: unknown[][] = [];
  if (options.maxArrayEntries > 0) {
    for (const [key, entry] of value) {
      entries.push([
        redact(key, options, depth + 1, ancestors),
        typeof key === "string" && isSecretKey(key)
          ? REDACTED
          : redact(entry, options, depth + 1, ancestors),
      ]);
      if (entries.length >= options.maxArrayEntries) break;
    }
  }
  if (value.size > options.maxArrayEntries) entries.push(["[TRUNCATED]", "[TRUNCATED]"]);
  return { type: "Map", entries };
}

function redactSet(
  value: Set<unknown>,
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): { type: "Set"; values: unknown[] } {
  const values: unknown[] = [];
  if (options.maxArrayEntries > 0) {
    for (const entry of value) {
      values.push(redact(entry, options, depth + 1, ancestors));
      if (values.length >= options.maxArrayEntries) break;
    }
  }
  if (value.size > options.maxArrayEntries) values.push("[TRUNCATED]");
  return { type: "Set", values };
}

function normalizeEntryLimit(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return Math.max(0, Math.floor(value));
}

function redactRecord(
  value: Record<string, unknown>,
  options: Required<OAuthRedactionOptions>,
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  let retained = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (retained >= options.maxObjectEntries) {
      defineEnumerable(redacted, "[TRUNCATED]", "[TRUNCATED]");
      break;
    }
    defineEnumerable(
      redacted,
      key,
      isSecretKey(key)
        ? REDACTED
        : redact(value[key], options, depth + 1, ancestors),
    );
    retained += 1;
  }
  return redacted;
}

function defineEnumerable(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function redactError(
  value: Error,
  enumerable: Record<string, unknown>,
  maxStringLength: number,
): Record<string, unknown> {
  return {
    ...enumerable,
    name: redactString(value.name, maxStringLength),
    message: redactString(value.message, maxStringLength),
    ...(value.stack ? { stack: redactString(value.stack, maxStringLength) } : {}),
  };
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
  copy.hash = "";
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
    normalized.endsWith("_api_key") ||
    normalized.endsWith("_token") ||
    normalized.endsWith("_password") ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_authorization") ||
    normalized.endsWith("_cookie") ||
    normalized.endsWith("_credential") ||
    normalized.endsWith("_credentials");
}

function normalizeKey(key: string): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_");
  return trimUnderscores(normalized).toLowerCase();
}

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}
