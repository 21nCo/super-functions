import {
  McpFnClientError,
  customTarget,
  streamableHttpTarget,
  type McpFnStreamableHttpTargetOptions,
  type McpFnTarget,
  type McpFnTransportHandle,
} from "@mcpfn/client";

import { redactOAuthValue } from "@superfunctions/oauth-core";

type SecretState = { active: Map<string, number>; scopes: Set<Set<string>> };
const targetSecrets = new WeakMap<McpFnTarget, SecretState>();
const utf8Encoder = new TextEncoder();

/** Retain released credentials only for the lifetime of a report operation. */
export function beginTargetCredentialRedaction(target: McpFnTarget): () => void {
  const state = targetSecrets.get(target);
  if (!state) return () => undefined;
  const scope = new Set(state.active.keys());
  state.scopes.add(scope);
  return () => { state.scopes.delete(scope); scope.clear(); };
}

function credentialValues(headers: HeadersInit): Set<string> {
  const values = boundedCredentialEntries(headers);
  const secrets = new Set<string>();
  for (const [header, raw] of values) {
    if (!raw.trim()) continue;
    secrets.add(raw);
    secrets.add(raw.trim());
    const normalizedHeader = header.toLowerCase();
    if (["authorization", "proxy-authorization"].includes(normalizedHeader)) {
      addAuthorizationSecrets(raw, secrets);
    }
    if (normalizedHeader === "cookie") addCookieSecrets(raw, secrets);
  }
  return secrets;
}

function addAuthorizationSecrets(raw: string, secrets: Set<string>): void {
  const trimmed = raw.trim();
  const separator = trimmed.search(/\s/);
  if (separator <= 0) return;
  const scheme = trimmed.slice(0, separator).toLowerCase();
  const token = trimmed.slice(separator).trim();
  if (token) secrets.add(token);
  if (scheme !== "basic") {
    if (scheme !== "bearer" && !authorizationToken68.test(token)) {
      addAuthorizationParameterSecrets(token, secrets);
    }
    return;
  }
  addBasicAuthorizationSecrets(token, secrets);
}

function addBasicAuthorizationSecrets(token: string, secrets: Set<string>): void {
  if (!/^[\dA-Za-z+/]+={0,2}$/.test(token)) return;
  const decoded = Buffer.from(token, "base64");
  // Round-trip validation avoids interpreting malformed tokens as credentials.
  if (stripBase64Padding(decoded.toString("base64")) !== stripBase64Padding(token)) return;
  for (const encoding of ["utf8", "latin1"] as const) {
    const pair = decoded.toString(encoding);
    const colon = pair.indexOf(":");
    if (colon < 0) continue;
    for (const value of [pair, pair.slice(0, colon), pair.slice(colon + 1)]) {
      if (value) secrets.add(value);
    }
  }
}

const authorizationToken68 = /^[\dA-Za-z._~+\x2F-]+=*$/;
const authorizationParameterName = /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/;

interface ParsedAuthorizationValue {
  cursor: number;
  components: string[];
}

function skipAuthorizationWhitespace(token: string, cursor: number): number {
  while (token[cursor] === " " || token[cursor] === "\t") cursor += 1;
  return cursor;
}

function parseQuotedAuthorizationValue(token: string, start: number): ParsedAuthorizationValue {
  let cursor = start + 1;
  let decoded = "";
  while (cursor < token.length && token[cursor] !== '"') {
    if (token[cursor] === "\\") {
      cursor += 1;
      if (cursor >= token.length) {
        throw new TypeError("Authorization credential parameters must use balanced quotes");
      }
    }
    decoded += token[cursor];
    cursor += 1;
  }
  if (token[cursor] !== '"') {
    throw new TypeError("Authorization credential parameters must use balanced quotes");
  }
  cursor += 1;
  const rawValue = token.slice(start, cursor);
  return {
    cursor,
    components: [rawValue, rawValue.slice(1, -1), decoded].filter(Boolean),
  };
}

function parseUnquotedAuthorizationValue(token: string, start: number): ParsedAuthorizationValue {
  let cursor = start;
  while (cursor < token.length && token[cursor] !== ",") cursor += 1;
  const value = token.slice(start, cursor).trim();
  if (!value || /\s/.test(value) || value.includes('"')) {
    throw new TypeError("Authorization credential parameters must contain valid values");
  }
  return { cursor, components: [value] };
}

function parseAuthorizationParameter(token: string, start: number): ParsedAuthorizationValue {
  let cursor = skipAuthorizationWhitespace(token, start);
  const nameStart = cursor;
  while (cursor < token.length && token[cursor] !== "=" &&
    token[cursor] !== " " && token[cursor] !== "\t" && token[cursor] !== ",") cursor += 1;
  const name = token.slice(nameStart, cursor);
  cursor = skipAuthorizationWhitespace(token, cursor);
  if (!authorizationParameterName.test(name) || token[cursor] !== "=") {
    throw new TypeError("Authorization credential parameters must use name=value syntax");
  }
  cursor = skipAuthorizationWhitespace(token, cursor + 1);
  if (cursor >= token.length) {
    throw new TypeError("Authorization credential parameters must contain values");
  }
  const parsed = token[cursor] === '"'
    ? parseQuotedAuthorizationValue(token, cursor)
    : parseUnquotedAuthorizationValue(token, cursor);
  return { ...parsed, cursor: skipAuthorizationWhitespace(token, parsed.cursor) };
}

function addAuthorizationParameterSecrets(token: string, secrets: Set<string>): void {
  const firstEquals = token.indexOf("=");
  if (firstEquals < 1 || !authorizationParameterName.test(token.slice(0, firstEquals).trim())) return;
  let cursor = 0;
  while (cursor < token.length) {
    const parsed = parseAuthorizationParameter(token, cursor);
    for (const component of parsed.components) secrets.add(component);
    cursor = parsed.cursor;
    if (cursor === token.length) return;
    if (token[cursor] !== ",") {
      throw new TypeError("Authorization credential parameters must be comma separated");
    }
    cursor = skipAuthorizationWhitespace(token, cursor + 1);
    if (cursor === token.length) {
      throw new TypeError("Authorization credential parameters must not end with a comma");
    }
  }
}

function stripBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") end -= 1;
  return value.slice(0, end);
}

function addCookieSecrets(raw: string, secrets: Set<string>): void {
  // Cookie values are independently reflectable even though the request
  // authenticates with the complete header. RFC 6265 cookie values cannot
  // contain comma or semicolon, so both delimiters cover combined entries.
  for (const part of raw.split(/[;,]/)) {
    const pair = part.trim();
    if (!pair) continue;
    const equals = pair.indexOf("=");
    if (equals < 1) {
      throw new TypeError("Cookie credential headers must contain name=value pairs");
    }
    const value = pair.slice(equals + 1).trim();
    if (!value) continue;
    secrets.add(value);
    addUnquotedCookieSecret(value, secrets);
  }
}

function addUnquotedCookieSecret(value: string, secrets: Set<string>): void {
  if (!value.startsWith('"') && !value.endsWith('"')) return;
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) {
    throw new TypeError("Cookie credential values must use balanced quotes");
  }
  const unquoted = value.slice(1, -1);
  if (unquoted.includes('"') || unquoted.includes("\\")) {
    throw new TypeError("Cookie credential values must use RFC 6265 syntax");
  }
  if (unquoted) secrets.add(unquoted);
}

export class McpFnRedactionLimitError extends Error {
  constructor(message = "Credential redaction exceeded its traversal budget") { super(message); }
}

/** No typed artifact can preserve this authored structure without exposing a credential. */
export class McpFnStructuralCredentialCollisionError extends McpFnRedactionLimitError {
  constructor() {
    super("Credential collides with required artifact structure");
  }
}

// Only these locally authored envelope paths retain structural keys. Unknown
// children (including inspector events and server metadata) are always payloads.
const envelopeKeys: Record<string, Set<string>> = Object.fromEntries(Object.entries({
  root: "formatVersion kind status runtime ok target server capabilities manifestChecked manifestHash total passed failed incomplete droppedResults droppedObservedEvents redactionOmittedObservedEvents incompleteReason failure timeline droppedTimelineEvents results count clientState tools resources resourceTemplates prompts droppedEvents timelineComplete droppedInventoryEntries inventoryComplete suiteVersion exitCode stdout stderr phase outcome code requestId at details payload",
  result: "formatVersion name operation tool status sideEffect durationMs error droppedObservedEvents redactionOmittedObservedEvents",
  diagnostic: "phase outcome code requestId at target details",
  inspectorEvent: "formatVersion source kind at event",
  failure: "name message layer code phase details",
  runtime: "node scenarioFormatVersion reportSchemaVersion packages",
  packages: "testing",
  droppedInventoryEntries: "tools resources resourceTemplates prompts",
  target: "kind",
}).map(([role, keys]) => [role, new Set(keys.split(" "))]));

const structuralArtifactValues = new Map<string, Set<string>>([
  ["root:kind", new Set(["logging.message", "progress", "tasks.status", "resources.updated", "tools.list_changed", "resources.list_changed", "prompts.list_changed", "resources.subscribed", "resources.unsubscribed", "client.roots", "client.sampling", "client.elicitation", "mcpfn.target-suite-report", "mcpfn.inspector-snapshot", "mcpfn.official-conformance-report"])],
  ["inspectorEvent:kind", new Set(["logging.message", "progress", "tasks.status", "resources.updated", "tools.list_changed", "resources.list_changed", "prompts.list_changed", "resources.subscribed", "resources.unsubscribed", "client.roots", "client.sampling", "client.elicitation"])],
  ["root:clientState", new Set(["idle", "connecting", "authorization-required", "connected", "closing", "closed"])],
  ["target:kind", new Set(["authenticated-streamable-http", "streamable-http", "stdio", "in-memory", "custom"])],
  ["root:status", new Set(["passed", "failed", "incomplete", "complete"])],
  ["result:status", new Set(["passed", "failed", "incomplete", "complete"])],
  ["root:outcome", new Set(["started", "succeeded", "failed"])],
  ["diagnostic:outcome", new Set(["started", "succeeded", "failed"])],
  ...["root", "diagnostic", "failure"].map(role => [
    `${role}:phase`,
    new Set(["resource-discovery", "authorization-server-discovery", "client-registration", "authorization-request", "authorization-callback", "token-exchange", "token-refresh", "token-revocation", "transport-connect", "mcp-initialize", "capability-operation", "transport-close"]),
  ] as [string, Set<string>]),
  ["failure:layer", new Set(["mcpfn-preflight", "authorization-server", "resource-server", "mcp-initialization", "scenario", "upstream-conformance"])],
  ["inspectorEvent:source", new Set(["diagnostic", "client"])],
  ["result:sideEffect", new Set(["none", "idempotent", "non-idempotent"])],
]);

const unrestrictedStructuralValueFields = new Set([
  "packages:testing",
  "runtime:node",
  "runtime:reportSchemaVersion",
  "root:suiteVersion",
]);

function childEnvelopeRole(
  fixed: boolean,
  key: string,
  role: string,
  input: Record<string, unknown>,
  rootKind: unknown,
): string {
  if (!fixed) return "payload";
  if (key === "results") return "result";
  if (key === "timeline") {
    return rootKind === "mcpfn.inspector-snapshot" ? "inspectorEvent" : "diagnostic";
  }
  if (["failure", "runtime", "packages", "droppedInventoryEntries", "target"].includes(key)) {
    return key;
  }
  if (role === "inspectorEvent" && key === "event") {
    return input.source === "client" ? "root" : "diagnostic";
  }
  return "payload";
}

function specialValue(input: unknown): unknown {
  if (input instanceof Error) return normalizeErrorValue(input);
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

function normalizeErrorValue(input: Error): Record<string, unknown> {
  // Error instances may expose attacker-controlled enumerable keys. A
  // null-prototype accumulator keeps `__proto__` as ordinary payload data.
  const normalized = Object.create(null) as Record<string, unknown>;
  let enumerableFields = 0;
  for (const key in input) {
    if (!Object.hasOwn(input, key)) continue;
    if (++enumerableFields > 100_000) throw new McpFnRedactionLimitError();
    normalized[key] = (input as unknown as Record<string, unknown>)[key];
  }
  normalized.name = input.name;
  normalized.message = input.message;
  normalized.stack = input.stack;
  if (input.cause !== undefined) normalized.cause = input.cause;
  return normalized;
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
    const literal = value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    // Only generated percent escapes accept mixed-case hex digits.
    return encoded
      ? literal.replace(/%[\dA-Fa-f]{2}/g, escape => escape.replace(/[A-Fa-f]/g, hex => `[${hex.toLowerCase()}${hex.toUpperCase()}]`))
      : literal;
  });
  const secretPattern = patterns.length ? new RegExp(patterns.join("|"), "g") : undefined;
  const replacementPattern = patterns.length ? new RegExp(patterns.join("|")) : undefined;
  const preserveStructural = (input: string): string => {
    if (replacementPattern?.test(input)) {
      throw new McpFnRedactionLimitError(
        "Credential collides with a required structural artifact field",
      );
    }
    return input;
  };
  const preserveStructuralKey = (input: string): string => {
    if (replacementPattern?.test(input)) {
      throw new McpFnStructuralCredentialCollisionError();
    }
    return input;
  };
  // A requested marker is itself output and must not reproduce a credential.
  if (secretPattern) {
    const markerContainsSecret = secretPattern.test(redactionMarker ?? "[REDACTED]");
    secretPattern.lastIndex = 0;
    if (markerContainsSecret) redactionMarker = "";
  }
  const scrubString = (input: string, role: string, field: string, finalPass: boolean): string => {
    const structuralField = `${role}:${field}`;
    if (unrestrictedStructuralValueFields.has(structuralField) ||
        structuralArtifactValues.get(structuralField)?.has(input)) {
      return preserveStructural(input);
    }
    // Whole-string rejection cannot compose another credential by joining pieces.
    // Run after both redactors; never feed this result through another redactor.
    if (finalPass) return replacementPattern?.test(input) ? "" : input;
    if (!secretPattern) return input;
    return input.replace(secretPattern, secret => {
      const maskCharacter = secret.includes("*") ? "#" : "*";
      const defaultReplacement = secret.length < 10
        ? maskCharacter.repeat(secret.length)
        : "[REDACTED]";
      const replacement = redactionMarker ?? defaultReplacement;
      // Every generated mask must be safe against the entire credential set.
      return replacementPattern!.test(replacement) ? "" : replacement;
    });
  };
  function scrubArray(input: unknown[], role: string, finalPass: boolean): unknown[] {
    const result = input.map(entry => scrub(entry, role, "", finalPass));
    assertPayloadSerialization(result, role, finalPass, replacementPattern);
    return result;
  }
  function scrubObject(
    input: Record<string, unknown>,
    role: string,
    finalPass: boolean,
  ): Record<string, unknown> {
    const entries: Array<[string, unknown]> = [];
    const keys = new Set<string>();
    for (const [key, entry] of Object.entries(input)) {
      const fixed = envelopeKeys[role]?.has(key) ?? false;
      if (fixed) preserveStructuralKey(key);
      const childRole = childEnvelopeRole(
        fixed,
        key,
        role,
        input,
        (value as { kind?: unknown } | null)?.kind,
      );
      const scrubbedKey = fixed ? key : scrub(key, "payload", "", finalPass) as string;
      if (keys.has(scrubbedKey)) {
        throw new McpFnRedactionLimitError(
          "Credential redaction created duplicate object keys",
        );
      }
      keys.add(scrubbedKey);
      const entryRole = fixed ? role : "payload";
      const scrubbedEntry = typeof entry === "string"
        ? scrub(entry, entryRole, key, finalPass)
        : scrub(entry, childRole, "", finalPass);
      entries.push([scrubbedKey, scrubbedEntry]);
    }
    const result = Object.fromEntries(entries);
    assertPayloadSerialization(result, role, finalPass, replacementPattern);
    return result;
  }
  function scrub(input: unknown, role = "payload", field = "", finalPass = false): unknown {
    input = specialValue(input);
    if (typeof input === "string") return scrubString(input, role, field, finalPass);
    if (Array.isArray(input)) return scrubArray(input, role, finalPass);
    if (input && typeof input === "object") {
      return scrubObject(input as Record<string, unknown>, role, finalPass);
    }
    return input;
  }
  const timelineEvent = value && typeof value === "object" && ["client", "diagnostic"].includes((value as { source?: string }).source ?? "");
  let role = "payload";
  if (preserveKeys) role = timelineEvent ? "inspectorEvent" : "root";
  const scrubbed = scrub(value, role);
  const generic = redactOAuthValue(scrubbed, { maxStringLength: 262_144, maxDepth: 64, maxArrayEntries: 100_000, maxObjectEntries: 100_000, ...(redactionMarker !== undefined ? { redactionMarker } : {}) });
  const result = scrub(generic, role, "", true) as T;
  assertPayloadSerialization(
    result,
    "payload",
    true,
    replacementPattern,
  );
  return result;
}

function assertPayloadSerialization(
  value: unknown,
  role: string,
  finalPass: boolean,
  credentialPattern: RegExp | undefined,
): void {
  if (!finalPass || role !== "payload" || !credentialPattern) return;
  const serialized = JSON.stringify(value);
  if (serialized !== undefined && credentialPattern.test(serialized)) {
    throw new McpFnRedactionLimitError(
      "Credential redaction could not guarantee safe serialized output",
    );
  }
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
  /** The lifecycle stage that most recently prevented credential release. */
  cleanupPhase(): "token-revocation" | "transport-close";
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
  let cleanupPhase: "token-revocation" | "transport-close" = credential.kind === "oauth"
    ? "token-revocation"
    : "transport-close";
  return {
    credential,
    cleanupPhase: () => cleanupPhase,
    release() {
      releasePromise ??= (async () => {
        // Cancellation of acquisition must not cancel revocation or its retries.
        const cleanupContext = { ...context, signal: new AbortController().signal };
        try {
          // Provider-local state may be required to retry revocation.
          if (!revoked) {
            cleanupPhase = credential.kind === "oauth" ? "token-revocation" : "transport-close";
            await provider.revoke?.(acquired, cleanupContext);
            revoked = true;
          }
          if (!disposed) {
            // Revocation already completed: a later disposal failure is not an
            // authorization-server failure.
            cleanupPhase = "transport-close";
            await provider.dispose?.(acquired, cleanupContext);
            disposed = true;
          }
        } catch {
          throw new McpFnClientError(
            "MCPFN_OPERATION_FAILED",
            "Target credential cleanup failed",
            { phase: cleanupPhase, retryable: true },
          );
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
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      const failure = failures.find(({ reason }) => reason && typeof reason === "object" &&
        (reason as { phase?: unknown }).phase === "token-revocation") ?? failures[0];
      if (failure) throw failure.reason;
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
        for (const secret of secrets) {
          const count = (state.active.get(secret) ?? 1) - 1;
          if (count) state.active.set(secret, count); else state.active.delete(secret);
        }
        secrets.clear();
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
      let transportClosed = false;
      return {
        transport: handle.transport,
        finishAuthorization: handle.finishAuthorization,
        terminateSession: handle.terminateSession,
        close() {
          closePromise ??= Promise.resolve().then(async () => {
            // The client coordinator retains this handle until both stages finish.
            // Never release authentication while transport shutdown still needs retry.
            if (!transportClosed) {
              if (handle!.close) await handle!.close();
              else await handle!.transport.close();
              transportClosed = true;
            }
            await release();
          }).catch(async (error) => {
            closePromise = undefined;
            const phase = transportClosed ? lease.cleanupPhase() : "transport-close";
            await targetContext.diagnostic({
              phase, outcome: "failed", code: "MCPFN_CREDENTIAL_CLEANUP_FAILED",
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
    if (utf8Encoder.encode(headerValue).byteLength > MAX_CREDENTIAL_HEADER_VALUE_BYTES) throw new TypeError("Credential header exceeds the value-size limit");
    bytes += utf8Encoder.encode(`${name}: ${headerValue}\r\n`).byteLength;
    if (bytes > MAX_CREDENTIAL_HEADER_BYTES) throw new TypeError("Credential headers exceed the aggregate size limit");
    entries.push([name, headerValue]);
  };
  if (value instanceof Headers) value.forEach((v, k) => append(k, v));
  else if (Array.isArray(value)) {
    if (value.length > MAX_CREDENTIAL_HEADERS) throw new TypeError("Credential headers exceed the header limit");
    for (const entry of value) append(entry[0], entry[1]);
  } else {
    for (const name in value) if (Object.hasOwn(value, name)) append(name, value[name]);
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
    const valueBytes = utf8Encoder.encode(headerValue).byteLength;
    if (valueBytes > MAX_CREDENTIAL_HEADER_VALUE_BYTES) {
      throw new TypeError(`Credential header ${name} exceeds the value-size limit`);
    }
    bytes += utf8Encoder.encode(`${name}: ${headerValue}\r\n`).byteLength;
  }
  if (bytes > MAX_CREDENTIAL_HEADER_BYTES) {
    throw new TypeError("Credential headers exceed the aggregate size limit");
  }
  return headers;
}
