const REDACTED = "[REDACTED]";

const SECRET_KEY = /(?:^|_)(?:access|refresh|id)?_?token$|authorization(?:_?code)?|bearer|password|secret|client_secret|code_verifier|pkce|state$|session(?:_?id)?|cookie|api_?key|credential/i;
const SENSITIVE_QUERY_KEY = /^(?:code|state|token|access_token|refresh_token|id_token|client_secret|code_verifier)$/i;

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
  }, 0) as T;
}

function redact(
  value: unknown,
  options: Required<OAuthRedactionOptions>,
  depth: number,
): unknown {
  if (depth > options.maxDepth) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayEntries)
      .map((entry) => redact(entry, options, depth + 1));
  }
  if (value && typeof value === "object") {
    if (value instanceof URL) return redactUrl(value, options.maxStringLength);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY.test(key) ? REDACTED : redact(entry, options, depth + 1),
      ]),
    );
  }
  if (typeof value === "string") {
    const redactedUrl = maybeRedactUrl(value, options.maxStringLength);
    if (redactedUrl !== undefined) return redactedUrl;
    return value.length > options.maxStringLength
      ? `${value.slice(0, options.maxStringLength)}…`
      : value;
  }
  return value;
}

function maybeRedactUrl(value: string, maxLength: number): string | undefined {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return undefined;
  try {
    return redactUrl(new URL(value), maxLength);
  } catch {
    return undefined;
  }
}

function redactUrl(url: URL, maxLength: number): string {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEY.test(key)) copy.searchParams.set(key, REDACTED);
  }
  copy.username = "";
  copy.password = "";
  const serialized = copy.toString();
  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength)}…`
    : serialized;
}
