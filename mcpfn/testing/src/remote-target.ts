import {
  customTarget,
  streamableHttpTarget,
  type McpFnStreamableHttpTargetOptions,
  type McpFnTarget,
  type McpFnTransportHandle,
} from "@mcpfn/client";

import { redactOAuthValue } from "@superfunctions/oauth-core";

type SecretState = { active: Map<string, number>; scopes: Set<Set<string>> };
const targetSecrets = new WeakMap<McpFnTarget, SecretState>();

/** Retain released credentials only for the lifetime of a report operation. */
export function beginTargetCredentialRedaction(target: McpFnTarget): () => void {
  const state = targetSecrets.get(target);
  if (!state) return () => undefined;
  const scope = new Set(state.active.keys());
  state.scopes.add(scope);
  return () => { state.scopes.delete(scope); scope.clear(); };
}

function credentialValues(headers: HeadersInit): Set<string> {
  const values = boundedCredentialEntries(headers).map((entry) => entry[1]);
  const secrets = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    secrets.add(raw);
    secrets.add(raw.trim());
    const trimmed = raw.trim();
    const separator = trimmed.search(/\s/);
    if (separator > 0) {
      const token = trimmed.slice(separator).trim();
      if (token) secrets.add(token);
      if (trimmed.slice(0, separator).toLowerCase() === "basic" && /^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
        const decoded = Buffer.from(token, "base64");
        // Round-trip validation avoids interpreting malformed tokens as credentials.
        if (decoded.toString("base64").replace(/=+$/, "") === token.replace(/=+$/, "")) {
          for (const encoding of ["utf8", "latin1"] as const) {
            const pair = decoded.toString(encoding);
            const colon = pair.indexOf(":");
            if (colon < 0) continue;
            for (const value of [pair, pair.slice(0, colon), pair.slice(colon + 1)]) {
              if (value) secrets.add(value);
            }
          }
        }
      }
    }
  }
  return secrets;
}

export class McpFnRedactionLimitError extends Error {
  constructor() { super("Credential redaction exceeded its traversal budget"); }
}

// Only these locally authored envelope paths retain structural keys. Unknown
// children (including inspector events and server metadata) are always payloads.
const envelopeKeys: Record<string, Set<string>> = Object.fromEntries(Object.entries({
  root: "formatVersion kind status runtime ok target server capabilities manifestChecked manifestHash total passed failed incomplete droppedResults droppedObservedEvents incompleteReason failure timeline droppedTimelineEvents results count clientState tools resources resourceTemplates prompts droppedEvents timelineComplete droppedInventoryEntries inventoryComplete suiteVersion exitCode stdout stderr phase outcome code requestId at details payload",
  result: "formatVersion name operation tool status sideEffect durationMs error droppedObservedEvents",
  diagnostic: "phase outcome code requestId at target details",
  inspectorEvent: "formatVersion source kind at event",
  failure: "name message layer code phase details",
  runtime: "node scenarioFormatVersion reportSchemaVersion packages",
  packages: "testing",
  droppedInventoryEntries: "tools resources resourceTemplates prompts",
  target: "kind",
}).map(([role, keys]) => [role, new Set(keys.split(" "))]));

function specialValue(input: unknown): unknown {
  if (input instanceof Error) return { ...input, name: input.name, message: input.message, stack: input.stack, ...(input.cause === undefined ? {} : { cause: input.cause }) };
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? "Invalid Date" : input.toISOString();
  if (input instanceof URL) return input.href;
  if (input instanceof Map) {
    if (Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!.call(input) > 100_000) throw new McpFnRedactionLimitError();
    return { type: "Map", entries: [...Map.prototype.entries.call(input)] };
  }
  if (input instanceof Set) {
    if (Object.getOwnPropertyDescriptor(Set.prototype, "size")!.get!.call(input) > 100_000) throw new McpFnRedactionLimitError();
    return { type: "Set", values: [...Set.prototype.values.call(input)] };
  }
  return input;
}

function scrubCredentials<T>(value: T, values: Iterable<string>, preserveKeys = false, redactionMarker?: string): T {
  // Preserve whether a pattern came from opaque text or a serializer. Literal
  // percent sequences in credentials must not acquire URL hex-case semantics.
  const variants = [...values].filter(Boolean).flatMap(secret => [
    { value: secret, encoded: false },
    { value: JSON.stringify(secret).slice(1, -1), encoded: false },
    { value: encodeURIComponent(secret), encoded: true },
    { value: new URLSearchParams({ value: secret }).toString().slice("value=".length), encoded: true },
  ]).sort((a, b) => b.value.length - a.value.length);
  let entries = 0, stringBytes = 0;
  const budget = (input: unknown, depth = 0): void => {
    input = specialValue(input);
    if ((Array.isArray(input) && input.length > 100_000) || ++entries > 100_000 || depth > 32) throw new McpFnRedactionLimitError();
    if (typeof input === "string") {
      stringBytes += Buffer.byteLength(input);
      if (input.length > 262_144 || stringBytes > 2_097_152) throw new McpFnRedactionLimitError();
    } else if (input && typeof input === "object") {
      for (const key in input) if (Object.hasOwn(input, key)) {
        budget(key, depth + 1);
        budget((input as Record<string, unknown>)[key], depth + 1);
      }
    }
  };
  // Check before either redactor allocates copies. Exceeding a budget is an
  // explicit failure, never silent truncation of a typed report collection.
  budget(value);
  const patterns = variants.map(({ value, encoded }) => {
    const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only generated percent escapes accept mixed-case hex digits.
    return encoded
      ? literal.replace(/%[0-9A-Fa-f]{2}/g, escape => escape.replace(/[A-Fa-f]/g, hex => `[${hex.toLowerCase()}${hex.toUpperCase()}]`))
      : literal;
  });
  const secretPattern = patterns.length ? new RegExp(patterns.join("|"), "g") : undefined;
  // A requested marker is itself output and must not reproduce a credential.
  if (secretPattern) {
    const markerContainsSecret = secretPattern.test(redactionMarker ?? "[REDACTED]");
    secretPattern.lastIndex = 0;
    if (markerContainsSecret) redactionMarker = "";
  }
  const clientKinds = new Set(["logging.message", "progress", "tasks.status", "resources.updated", "tools.list_changed", "resources.list_changed", "prompts.list_changed", "resources.subscribed", "resources.unsubscribed", "client.roots", "client.sampling", "client.elicitation"]);
  const scrub = (input: unknown, role = "payload", field = ""): unknown => {
    input = specialValue(input);
    if (typeof input === "string") {
      if ((role === "root" || role === "inspectorEvent") && field === "kind" && clientKinds.has(input)) return input;
      if (role === "root" && field === "clientState" && ["idle", "connecting", "authorization-required", "connected", "closing", "closed"].includes(input)) return input;
      if (role === "target" && field === "kind" && ["authenticated-streamable-http", "streamable-http", "stdio", "in-memory", "custom"].includes(input)) return input;
      if ((role === "packages" && field === "testing") || (role === "runtime" && ["node", "reportSchemaVersion"].includes(field)) || (role === "root" && field === "suiteVersion")) return input;
      if ((role === "root" || role === "result") && field === "status" && ["passed", "failed", "incomplete", "complete"].includes(input)) return input;
      if ((role === "root" || role === "diagnostic") && field === "outcome" && ["started", "succeeded", "failed"].includes(input)) return input;
      if (role === "root" && field === "kind" && ["mcpfn.target-suite-report", "mcpfn.inspector-snapshot", "mcpfn.official-conformance-report"].includes(input)) return input;
      if ((role === "root" || role === "diagnostic" || role === "failure") && field === "phase" && ["resource-discovery", "authorization-server-discovery", "client-registration", "authorization-request", "authorization-callback", "token-exchange", "token-refresh", "token-revocation", "transport-connect", "mcp-initialize", "capability-operation", "transport-close"].includes(input)) return input;
      if (role === "failure" && field === "layer" && ["mcpfn-preflight", "authorization-server", "resource-server", "mcp-initialization", "scenario", "upstream-conformance"].includes(input)) return input;
      if (role === "inspectorEvent" && field === "source" && ["diagnostic", "client"].includes(input)) return input;
      if (role === "result" && field === "sideEffect" && ["none", "idempotent", "non-idempotent"].includes(input)) return input;
      return secretPattern ? input.replace(secretPattern, secret => redactionMarker ?? (secret.length < 10 ? (secret.includes("*") ? "#" : "*").repeat(secret.length) : "[REDACTED]")) : input;
    }
    if (Array.isArray(input)) return input.map(entry => scrub(entry, role));
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, entry]) => {
      const fixed = envelopeKeys[role]?.has(key) ?? false;
      let childRole = "payload";
      if (fixed) {
        if (key === "results") childRole = "result";
        else if (key === "timeline") childRole = (value as any)?.kind === "mcpfn.inspector-snapshot" ? "inspectorEvent" : "diagnostic";
        else if (["failure", "runtime", "packages", "droppedInventoryEntries", "target"].includes(key)) childRole = key;
        else if (role === "inspectorEvent" && key === "event") childRole = (input as { source?: string }).source === "client" ? "root" : "diagnostic";
      }
      return [fixed ? key : scrub(key), typeof entry === "string" ? scrub(entry, fixed ? role : "payload", key) : scrub(entry, childRole)];
    }));
    return input;
  };
  const timelineEvent = value && typeof value === "object" && ["client", "diagnostic"].includes((value as { source?: string }).source ?? "");
  const scrubbed = scrub(value, preserveKeys ? (timelineEvent ? "inspectorEvent" : "root") : "payload");
  return redactOAuthValue(scrubbed, { maxStringLength: 262_144, maxDepth: 64, maxArrayEntries: 100_000, maxObjectEntries: 100_000, ...(redactionMarker !== undefined ? { redactionMarker } : {}) }) as T;
}

/** Remove known opaque credential values as well as credential-shaped fields. */
export function redactTargetCredentials<T>(target: McpFnTarget, value: T, options: { preserveKeys?: boolean; redactionMarker?: string } = {}): T {
  const state = targetSecrets.get(target);
  return scrubCredentials(value, new Set([...(state?.active.keys() ?? []), ...[...(state?.scopes ?? [])].flatMap((scope) => [...scope])]), options.preserveKeys, options.redactionMarker);
}

/** Redact authenticated conformance output using the acquired credential. */
export function redactRemoteCredential<T>(credential: McpFnRemoteCredential, value: T, options: { preserveKeys?: boolean } = {}): T {
  return scrubCredentials(value, credentialValues(credential.headers), options.preserveKeys);
}

const MAX_CREDENTIAL_HEADERS = 32;
const MAX_CREDENTIAL_HEADER_BYTES = 16_384;
const MAX_CREDENTIAL_HEADER_VALUE_BYTES = 8_192;
const FORBIDDEN_CREDENTIAL_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export type McpFnRemoteCredentialKind = "api-key" | "oauth" | "custom";

export interface McpFnRemoteCredential {
  /** Credential headers are applied only to the fixed target origin. */
  headers: HeadersInit;
  kind?: McpFnRemoteCredentialKind;
  label?: string;
}

export interface McpFnRemoteCredentialContext {
  url: string;
  requestId: string;
  signal?: AbortSignal;
}

/**
 * Application-owned credential lifecycle for external MCP targets. McpFn
 * acquires once per target open, revokes before disposal, and never serializes
 * the returned headers into descriptors or reports. If acquisition rejects, the
 * provider must roll back its own partial resources; no lease has been returned.
 */
export interface McpFnRemoteCredentialProvider {
  acquire(
    context: McpFnRemoteCredentialContext,
  ): McpFnRemoteCredential | Promise<McpFnRemoteCredential>;
  revoke?(
    credential: McpFnRemoteCredential,
    context: McpFnRemoteCredentialContext,
  ): void | Promise<void>;
  dispose?(
    credential: McpFnRemoteCredential,
    context: McpFnRemoteCredentialContext,
  ): void | Promise<void>;
}

export interface McpFnRemoteCredentialLease {
  credential: McpFnRemoteCredential;
  release(): Promise<void>;
}

export interface McpFnAuthenticatedHttpTargetOptions
  extends Omit<McpFnStreamableHttpTargetOptions, "authProvider" | "requestInit"> {
  credential: McpFnRemoteCredential | McpFnRemoteCredentialProvider;
  requestInit?: Omit<RequestInit, "headers" | "redirect"> & { headers?: HeadersInit };
}

/** Create a provider for an already-bounded API key or OAuth-derived token. */
export function staticRemoteCredentialProvider(
  credential: McpFnRemoteCredential,
): McpFnRemoteCredentialProvider {
  return { acquire: () => credential };
}

/** Acquire a credential and return an idempotent revoke-then-dispose lease. */
export async function acquireRemoteCredential(
  source: McpFnRemoteCredential | McpFnRemoteCredentialProvider,
  context: McpFnRemoteCredentialContext,
): Promise<McpFnRemoteCredentialLease> {
  let provider: McpFnRemoteCredentialProvider;
  let acquired: McpFnRemoteCredential;
  try {
    provider = isCredentialProvider(source) ? source : staticRemoteCredentialProvider(source);
    acquired = await provider.acquire(context);
  } catch {
    // Until acquisition returns, its opaque secrets are unknown to the redactor.
    // The provider owns rollback of resources allocated before it rejects.
    throw new Error("Target credential acquisition failed");
  }
  let credential = acquired;
  try {
    // Detach all valid header forms from provider-owned mutable storage.
    credential = { ...acquired, headers: boundedCredentialEntries(acquired.headers) };
  } catch {
    // Invalid headers are rejected by the caller's validation inside its cleanup
    // boundary. Keep the acquired object so that rejection can still revoke it.
  }
  let releasePromise: Promise<void> | undefined;
  let revoked = false;
  let disposed = false;
  return {
    credential,
    release() {
      releasePromise ??= (async () => {
        // Cancellation of acquisition must not cancel revocation or its retries.
        const cleanupContext = { ...context, signal: new AbortController().signal };
        try {
          // Provider-local state may be required to retry revocation.
          if (!revoked) { await provider.revoke?.(acquired, cleanupContext); revoked = true; }
          if (!disposed) { await provider.dispose?.(acquired, cleanupContext); disposed = true; }
        } catch {
          throw new Error("Target credential cleanup failed");
        }
      })().catch(error => { releasePromise = undefined; throw error; });
      return releasePromise;
    },
  };
}

/**
 * A URL-plus-credential target for non-McpFn servers. It delegates MCP and
 * transport behavior to the production @mcpfn/client session engine.
 */
export function authenticatedHttpTarget(
  url: string | URL,
  options: McpFnAuthenticatedHttpTargetOptions,
): McpFnTarget {
  const targetUrl = normalizeRemoteTargetUrl(url);
  const descriptorUrl = new URL(targetUrl);
  descriptorUrl.search = "";
  const { credential: _credential, requestInit, ...transportOptions } = options;
  void _credential;

  const state: SecretState = { active: new Map(), scopes: new Set() };
  const pendingReleases = new Set<() => Promise<void>>();
  const authenticated = customTarget({
    kind: "authenticated-streamable-http",
    descriptor: {
      url: descriptorUrl.toString(),
      authenticated: true,
    },
    redact: (value, redaction) => redactTargetCredentials(authenticated, value, { preserveKeys: true, ...redaction }),
    async cleanup() {
      const results = await Promise.allSettled([...pendingReleases].map(release => release()));
      if (results.some(result => result.status === "rejected")) throw new Error("Target credential cleanup failed");
    },
    async open(targetContext): Promise<McpFnTransportHandle> {
      const context: McpFnRemoteCredentialContext = {
        url: targetUrl.toString(),
        requestId: targetContext.requestId,
        signal: targetContext.signal,
      };
      const lease = await acquireRemoteCredential(options.credential, context);
      const secrets = new Set<string>();
      const release = async () => {
        try { await lease.release(); }
        catch (error) { pendingReleases.add(release); throw error; }
        pendingReleases.delete(release);
        {
          for (const secret of secrets) {
            const count = (state.active.get(secret) ?? 1) - 1;
            if (count) state.active.set(secret, count); else state.active.delete(secret);
          }
          secrets.clear();
        }
      };
      let handle: McpFnTransportHandle | undefined;
      try {
        for (const secret of credentialValues(lease.credential.headers)) {
          secrets.add(secret);
          state.active.set(secret, (state.active.get(secret) ?? 0) + 1);
          for (const scope of state.scopes) scope.add(secret);
        }
        const credentialHeaders = validateRemoteCredentialHeaders(lease.credential.headers);
        const headers = new Headers(requestInit?.headers);
        credentialHeaders.forEach((value, name) => headers.set(name, value));
        const target = streamableHttpTarget(targetUrl, {
          ...transportOptions,
          requestInit: {
            ...requestInit,
            headers,
            // Fetch must not replay credentials to a redirect destination.
            redirect: "error",
          },
        });
        handle = await target.open(targetContext);
      } catch (error) {
        // Sanitize while the lease still supplies its immutable header snapshot.
        // Cleanup removes active secrets before the client emits failed-open diagnostics.
        let message = "Authenticated target could not be opened";
        try { message = redactRemoteCredential(lease.credential, error instanceof Error ? error.message : String(error)); }
        catch { /* Invalid or oversized credentials must not escape through diagnostics. */ }
        pendingReleases.add(release);
        await release();
        throw new Error(message);
      }

      let closePromise: Promise<void> | undefined;
      return {
        transport: handle.transport,
        finishAuthorization: handle.finishAuthorization,
        terminateSession: handle.terminateSession,
        close() {
          closePromise ??= closeAuthenticatedHandle(
            handle!,
            { ...lease, release },
          ).catch(async (error) => {
            closePromise = undefined;
            await targetContext.diagnostic({
              phase: "transport-close", outcome: "failed", code: "MCPFN_CREDENTIAL_CLEANUP_FAILED",
              requestId: targetContext.requestId, at: new Date().toISOString(),
              target: { kind: "authenticated-streamable-http", url: descriptorUrl.toString() },
              details: { message: "Target credential cleanup failed" },
            });
            throw error;
          });
          return closePromise;
        },
      };
    },
  });
  targetSecrets.set(authenticated, state);
  return authenticated;
}

function normalizeRemoteTargetUrl(value: string | URL): URL {
  const url = new URL(value.toString());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Authenticated MCP targets must use HTTP or HTTPS");
  }
  if (url.protocol === "http:" && url.hostname !== "[::1]" &&
      !/^127(?:\.\d{1,3}){3}$/.test(url.hostname)) {
    throw new TypeError("Credential-bearing HTTP targets require a literal loopback address; use HTTPS remotely");
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError(
      "Authenticated MCP target URLs must not contain userinfo or a fragment",
    );
  }
  return url;
}

function isCredentialProvider(
  value: McpFnRemoteCredential | McpFnRemoteCredentialProvider,
): value is McpFnRemoteCredentialProvider {
  return "acquire" in value && typeof value.acquire === "function";
}

function boundedCredentialEntries(value: HeadersInit): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  let bytes = 0;
  const append = (name: string, headerValue: string) => {
    if (entries.length >= MAX_CREDENTIAL_HEADERS) throw new TypeError("Credential headers exceed the header limit");
    if (typeof name !== "string" || typeof headerValue !== "string") throw new TypeError("Credential header values must be strings");
    if (name.length > MAX_CREDENTIAL_HEADER_BYTES || headerValue.length > MAX_CREDENTIAL_HEADER_VALUE_BYTES) throw new TypeError("Credential header exceeds the value-size limit");
    if (new TextEncoder().encode(headerValue).byteLength > MAX_CREDENTIAL_HEADER_VALUE_BYTES) throw new TypeError("Credential header exceeds the value-size limit");
    bytes += new TextEncoder().encode(`${name}: ${headerValue}\r\n`).byteLength;
    if (bytes > MAX_CREDENTIAL_HEADER_BYTES) throw new TypeError("Credential headers exceed the aggregate size limit");
    entries.push([name, headerValue]);
  };
  if (value instanceof Headers) value.forEach((v, k) => append(k, v));
  else if (Array.isArray(value)) {
    if (value.length > MAX_CREDENTIAL_HEADERS) throw new TypeError("Credential headers exceed the header limit");
    for (const entry of value) append(entry[0], entry[1]);
  } else {
    for (const name in value) if (Object.prototype.hasOwnProperty.call(value, name)) append(name, value[name]);
  }
  return entries;
}

export function validateRemoteCredentialHeaders(value: HeadersInit): Headers {
  const headers = new Headers(boundedCredentialEntries(value));
  const entries: Array<[string, string]> = [];
  headers.forEach((headerValue, name) => entries.push([name, headerValue]));
  if (entries.length === 0) {
    throw new TypeError("Authenticated MCP targets require at least one credential header");
  }
  if (entries.length > MAX_CREDENTIAL_HEADERS) {
    throw new TypeError(`Credential headers exceed the ${MAX_CREDENTIAL_HEADERS}-header limit`);
  }
  let bytes = 0;
  for (const [name, headerValue] of entries) {
    if (!headerValue.trim()) throw new TypeError("Credential header values must not be blank");
    if (FORBIDDEN_CREDENTIAL_HEADERS.has(name)) {
      throw new TypeError(`Credential header ${name} is not allowed`);
    }
    const valueBytes = new TextEncoder().encode(headerValue).byteLength;
    if (valueBytes > MAX_CREDENTIAL_HEADER_VALUE_BYTES) {
      throw new TypeError(`Credential header ${name} exceeds the value-size limit`);
    }
    if (new TextEncoder().encode(headerValue).byteLength > MAX_CREDENTIAL_HEADER_VALUE_BYTES) throw new TypeError("Credential header exceeds the value-size limit");
    bytes += new TextEncoder().encode(`${name}: ${headerValue}\r\n`).byteLength;
  }
  if (bytes > MAX_CREDENTIAL_HEADER_BYTES) {
    throw new TypeError("Credential headers exceed the aggregate size limit");
  }
  return headers;
}

async function closeAuthenticatedHandle(
  handle: McpFnTransportHandle,
  lease: McpFnRemoteCredentialLease,
): Promise<void> {
  try {
    if (handle.close) await handle.close();
    else await handle.transport.close();
  } finally {
    await lease.release();
  }
}
