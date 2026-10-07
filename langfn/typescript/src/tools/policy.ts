import { NotConfiguredError, ToolDisabledError, ToolPolicyViolationError } from "../core/errors.js";

export type SecretProvider = (secretRef: string) => string | undefined;
export type OutputSanitizer = (value: unknown) => unknown;
export type SandboxExecutor = (code: string) => unknown | Promise<unknown>;
export type SearchBackend = (query: string) => unknown | Promise<unknown>;

export function redactSensitiveFields(
  value: unknown,
  sensitiveKeys: readonly string[] = ["authorization", "ssn"]
): unknown {
  const keySet = new Set(sensitiveKeys.map((key) => key.toLowerCase()));
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, sensitiveKeys));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        keySet.has(key.toLowerCase()) ? "***REDACTED***" : redactSensitiveFields(item, sensitiveKeys)
      ])
    );
  }
  return value;
}

export function sanitizeOutput(value: unknown): unknown {
  if (typeof value === "string") {
    return /<\s*script\b/i.test(value) ? "safe string" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOutput(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeOutput(item)])
    );
  }
  return value;
}

export function resolveSecret(secretRef: string | undefined, provider?: SecretProvider): string | undefined {
  if (!secretRef) return undefined;
  if (!provider) {
    throw new NotConfiguredError("Secret provider is required", { metadata: { secretRef } });
  }
  const value = provider(secretRef);
  if (!value) {
    throw new NotConfiguredError("Required secret is missing", { metadata: { secretRef } });
  }
  return value;
}

export function enforceOutboundPolicy(
  url: string,
  options: { allowPrivateNetwork?: boolean; allowedHosts?: readonly string[] } = {}
): void {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ToolPolicyViolationError("Only HTTP(S) URLs without embedded credentials are allowed");
  }
  const host = parsed.hostname.toLowerCase();
  if ((options.allowedHosts ?? []).map((item) => item.toLowerCase()).includes(host)) {
    return;
  }
  if (options.allowPrivateNetwork) return;
  // Fetch does not expose or pin DNS resolution consistently across Node and Workers.
  // Require explicit trust for hostnames and IPv6 rather than performing a racy DNS precheck.
  if (!isIpAddress(host) || isBlockedIp(host)) {
    throw new ToolPolicyViolationError("Outbound host requires an explicit allowedHosts entry", { metadata: { host } });
  }
}

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isBlockedIp(host: string): boolean {
  if (host === "169.254.169.254") return true;
  const parts = host.split(".").map((part) => Number(part));
  return (
    parts[0] === 0 || parts[0] >= 224 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 192 && parts[1] === 0) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) ||
    (parts[0] === 203 && parts[1] === 0) ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

export class ToolPolicy {
  readonly secretProvider?: SecretProvider;
  readonly sanitizer: OutputSanitizer;
  readonly maxResponseBytes?: number;
  readonly allowedHosts: readonly string[];
  readonly allowPrivateNetwork: boolean;
  readonly sandboxExecutor?: SandboxExecutor;
  readonly searchBackend?: SearchBackend;
  readonly redactKeys: readonly string[];

  constructor(options: {
    secretProvider?: SecretProvider;
    sanitizer?: OutputSanitizer;
    maxResponseBytes?: number;
    allowedHosts?: readonly string[];
    allowPrivateNetwork?: boolean;
    sandboxExecutor?: SandboxExecutor;
    searchBackend?: SearchBackend;
    redactKeys?: readonly string[];
  } = {}) {
    if (options.maxResponseBytes !== undefined && (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 0)) {
      throw new RangeError("maxResponseBytes must be a nonnegative safe integer");
    }
    this.maxResponseBytes = options.maxResponseBytes;
    this.secretProvider = options.secretProvider;
    this.sanitizer = options.sanitizer ?? sanitizeOutput;
    this.allowedHosts = [...(options.allowedHosts ?? [])];
    this.allowPrivateNetwork = options.allowPrivateNetwork ?? false;
    this.sandboxExecutor = options.sandboxExecutor;
    this.searchBackend = options.searchBackend;
    this.redactKeys = [...(options.redactKeys ?? ["authorization", "ssn"])];
  }

  sanitize(value: unknown): unknown {
    return this.sanitizer(value);
  }

  redact(value: unknown): unknown {
    return redactSensitiveFields(value, this.redactKeys);
  }

  requireSearchBackend(): SearchBackend {
    if (!this.searchBackend) {
      throw new NotConfiguredError("Web search backend is not configured");
    }
    return this.searchBackend;
  }

  requireSandbox(): SandboxExecutor {
    if (!this.sandboxExecutor) {
      throw new ToolDisabledError("Code execution sandbox is disabled");
    }
    return this.sandboxExecutor;
  }
}
