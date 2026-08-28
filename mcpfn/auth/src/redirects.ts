export interface McpFnRedirectPolicy {
  allowDynamicLoopbackPort?: boolean;
  allowLocalhostLoopback?: boolean;
  allowPrivateUseSchemes?: boolean;
}

export interface McpFnRedirectMatch {
  requested: string;
  registered: string;
  kind: "exact" | "loopback-dynamic-port";
}

export class McpFnRedirectMismatchError extends Error {
  readonly code = "MCPFN_REDIRECT_MISMATCH";
  readonly requested: string;

  constructor(requested: string) {
    super("The authorization redirect URI is not registered for this MCP client");
    this.name = "McpFnRedirectMismatchError";
    this.requested = redactRedirect(requested);
  }
}

/**
 * Normalize a registered or requested redirect under the MCP OAuth profile.
 * HTTPS is the default. Plain HTTP is restricted to loopback hosts and
 * fragments/userinfo are always rejected.
 */
export function normalizeMcpRedirectUri(
  value: string | URL,
  policy: McpFnRedirectPolicy = {},
): string {
  let url: URL;
  try {
    url = new URL(value.toString());
  } catch {
    throw new McpFnRedirectMismatchError(String(value));
  }
  if (url.username || url.password || url.hash || url.hostname.includes("*")) {
    throw new McpFnRedirectMismatchError(url.toString());
  }
  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "http:" && isLoopback(url, policy)) return url.toString();
  if (
    policy.allowPrivateUseSchemes === true &&
    !["http:", "https:", "javascript:", "data:", "file:"].includes(url.protocol)
  ) {
    return url.toString();
  }
  throw new McpFnRedirectMismatchError(url.toString());
}

/** Exact matching, with RFC 8252 loopback ports enabled unless explicitly disabled. */
export function matchMcpRedirectUri(
  requested: string | URL,
  registeredRedirectUris: ReadonlyArray<string | URL>,
  policy: McpFnRedirectPolicy = {},
): McpFnRedirectMatch {
  const actual = new URL(normalizeMcpRedirectUri(requested, policy));
  for (const candidateValue of registeredRedirectUris) {
    const candidate = new URL(normalizeMcpRedirectUri(candidateValue, policy));
    if (candidate.toString() === actual.toString()) {
      return {
        requested: actual.toString(),
        registered: candidate.toString(),
        kind: "exact",
      };
    }
    if (
      policy.allowDynamicLoopbackPort !== false &&
      isLoopback(actual, policy) &&
      isLoopback(candidate, policy) &&
      candidate.port === "" &&
      actual.port !== "" &&
      equalExceptPort(actual, candidate)
    ) {
      return {
        requested: actual.toString(),
        registered: candidate.toString(),
        kind: "loopback-dynamic-port",
      };
    }
  }
  throw new McpFnRedirectMismatchError(actual.toString());
}

function isLoopback(url: URL, policy: McpFnRedirectPolicy): boolean {
  if (url.protocol !== "http:") return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    (policy.allowLocalhostLoopback === true && hostname === "localhost");
}

function equalExceptPort(left: URL, right: URL): boolean {
  return left.protocol === right.protocol &&
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    left.pathname === right.pathname &&
    left.search === right.search &&
    left.hash === right.hash &&
    left.username === right.username &&
    left.password === right.password;
}

function redactRedirect(value: string): string {
  try {
    const url = new URL(value);
    url.search = url.search ? "?redacted" : "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[invalid redirect URI]";
  }
}
