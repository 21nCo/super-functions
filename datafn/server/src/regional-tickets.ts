import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DATAFN_ROUTE_MAX_TTL_MS, DATAFN_ROUTE_TICKET_HEADER,
  DATAFN_ROUTE_WS_PROTOCOL, DATAFN_ROUTE_WS_TICKET_PREFIX,
  validateDatafnRegionalEndpoint,
  type DatafnRegionalRouteDescriptor, type DatafnRouteScope,
} from "@datafn/core";
import {
  DatafnRoutingError, type DatafnNamespacePlacement,
  type DatafnPlacementDirectoryAdapter,
} from "./multi-region-routing.js";

export interface DatafnRouteIdentity {
  /** Opaque authenticated subject; never derived from routing headers. */
  subject: string;
  namespace: string;
  sessionBinding?: string;
  /** Optional upstream session deadline bounds the grant. */
  expiresAt?: number;
}

export interface DatafnRouteTicketClaims {
  version: 1;
  issuer: string;
  audience: string;
  subject: string;
  namespace: string;
  regionId: string;
  epoch: number;
  scopes: DatafnRouteScope[];
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
  ticketId: string;
  sessionBinding?: string;
}

export interface DatafnRouteTicketSigner {
  sign(claims: DatafnRouteTicketClaims): Promise<string> | string;
}
export interface DatafnRouteTicketVerifier {
  verify(ticket: string): Promise<DatafnRouteTicketClaims> | DatafnRouteTicketClaims;
}
export interface DatafnRouteTicketEvent {
  type: "issued" | "accepted" | "rejected" | "renewal_failed";
  code?: string;
}

const scopes = new Set<DatafnRouteScope>([
  "query", "search", "mutation", "transact", "seed", "clone", "pull", "push",
  "reconcile", "custom", "websocket",
]);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 1024;

export function routeTicketError(
  code: "DATAFN_ROUTE_TICKET_INVALID" | "DATAFN_ROUTE_TICKET_EXPIRED" |
    "DATAFN_ROUTE_TICKET_REVOKED" | "DATAFN_ROUTE_FORBIDDEN" | "DATAFN_ROUTE_RATE_LIMITED",
): DatafnRoutingError {
  return new DatafnRoutingError({
    code, message: code, status: code === "DATAFN_ROUTE_RATE_LIMITED" ? 429 :
      code === "DATAFN_ROUTE_FORBIDDEN" ? 403 : 401,
    retryable: code === "DATAFN_ROUTE_TICKET_EXPIRED" || code === "DATAFN_ROUTE_RATE_LIMITED", executionStarted: false,
  });
}

function assertClaims(value: DatafnRouteTicketClaims): void {
  if (!value || value.version !== 1 ||
    ![value.issuer, value.audience, value.subject, value.namespace, value.regionId, value.ticketId].every(text) ||
    !Number.isSafeInteger(value.epoch) || value.epoch < 1 ||
    ![value.issuedAt, value.notBefore, value.expiresAt].every(Number.isSafeInteger) ||
    value.notBefore < value.issuedAt || value.notBefore >= value.expiresAt ||
    value.expiresAt - value.issuedAt > DATAFN_ROUTE_MAX_TTL_MS ||
    !Array.isArray(value.scopes) || value.scopes.length === 0 ||
    value.scopes.some(scope => !scopes.has(scope)) ||
    new Set(value.scopes).size !== value.scopes.length ||
    (value.sessionBinding !== undefined && !text(value.sessionBinding))) {
    throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
  }
}

/** Separate signing domain and key ring from DATA-1 internal request assertions. */
export function createDatafnHmacRouteTickets(input: {
  activeKeyId: string;
  /** At least 32 bytes of cryptographically random key material per key. */
  keys: Record<string, string | Uint8Array>;
}): DatafnRouteTicketSigner & DatafnRouteTicketVerifier {
  const keys = new Map(Object.entries(input.keys).map(([id, key]) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || Buffer.byteLength(key) < 32) {
      throw new Error("DATAFN_ROUTE_KEY_INVALID");
    }
    return [id, Buffer.from(key)] as const;
  }));
  if (!keys.has(input.activeKeyId)) throw new Error("DATAFN_ROUTE_ACTIVE_KEY_MISSING");
  const signature = (content: string, key: Uint8Array) =>
    createHmac("sha256", key).update(`datafn-regional-route-v1:${content}`).digest();
  return {
    sign(claims) {
      assertClaims(claims);
      const header = Buffer.from(JSON.stringify({ typ: "datafn-route-v1", alg: "HS256", kid: input.activeKeyId })).toString("base64url");
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const content = `${header}.${payload}`;
      return `${content}.${signature(content, keys.get(input.activeKeyId)!).toString("base64url")}`;
    },
    verify(ticket) {
      try {
        if (typeof ticket !== "string" || ticket.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)) throw new Error();
        const [header, payload, mac] = ticket.split(".");
        const protectedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
        const key = keys.get(protectedHeader.kid);
        if (!key || protectedHeader.typ !== "datafn-route-v1" || protectedHeader.alg !== "HS256") throw new Error();
        const expected = signature(`${header}.${payload}`, key);
        const actual = Buffer.from(mac, "base64url");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        assertClaims(claims);
        return claims;
      } catch {
        throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
      }
    },
  };
}

export interface DatafnRegionalEndpoint {
  httpUrl: string;
  wsUrl?: string;
  /** Unique audience per environment/cell endpoint. */
  audience: string;
}
export interface DatafnRouteBootstrapConfig {
  directory: DatafnPlacementDirectoryAdapter;
  authenticate(request: Request): Promise<DatafnRouteIdentity> | DatafnRouteIdentity;
  resolveEndpoint(placement: DatafnNamespacePlacement): Promise<DatafnRegionalEndpoint> | DatafnRegionalEndpoint;
  /** Application-owned authorization selects operations; never accept requested scopes verbatim. */
  authorize(identity: DatafnRouteIdentity): Promise<readonly DatafnRouteScope[]> | readonly DatafnRouteScope[];
  signer: DatafnRouteTicketSigner;
  issuer: string;
  ttlMs?: number;
  now?: () => number;
  onEvent?(event: DatafnRouteTicketEvent): void;
}

/** Mount at one canonical, authenticated POST endpoint. Request body/region headers are ignored. */
export function createDatafnRouteBootstrap(config: DatafnRouteBootstrapConfig) {
  const ttl = config.ttlMs ?? 60_000;
  if (!text(config.issuer) || !Number.isSafeInteger(ttl) || ttl < 1000 || ttl > DATAFN_ROUTE_MAX_TTL_MS) {
    throw new Error("DATAFN_ROUTE_BOOTSTRAP_CONFIG_INVALID");
  }
  const now = config.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
      const identity = await config.authenticate(request);
      if (!identity || !text(identity.subject) || !text(identity.namespace)) throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
      let placement: DatafnNamespacePlacement | null;
      try { placement = await config.directory.get(identity.namespace); }
      catch { throw new DatafnRoutingError({ code: "DATAFN_PLACEMENT_UNAVAILABLE", message: "Placement unavailable", status: 503, retryable: true }); }
      if (!placement || placement.namespace !== identity.namespace || placement.state === "tombstoned") {
        throw new DatafnRoutingError({ code: "DATAFN_PLACEMENT_NOT_FOUND", message: "Placement not found", status: 404, retryable: false });
      }
      if (placement.state !== "active" || placement.migration) {
        throw new DatafnRoutingError({ code: "DATAFN_NAMESPACE_MOVING", message: "Placement is fenced", status: 409, retryable: true });
      }
      const permitted = [...await config.authorize(identity)];
      const endpoint = await config.resolveEndpoint(placement);
      const issuedAt = now();
      const expiresAt = Math.min(issuedAt + ttl, identity.expiresAt ?? Infinity);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
      const httpUrl = validateDatafnRegionalEndpoint(endpoint.httpUrl);
      const wsUrl = endpoint.wsUrl ? validateDatafnRegionalEndpoint(endpoint.wsUrl, true) : undefined;
      if (permitted.includes("websocket") && !wsUrl) throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
      const ticket = await config.signer.sign({
        version: 1, issuer: config.issuer, audience: endpoint.audience,
        subject: identity.subject, namespace: identity.namespace,
        regionId: placement.regionId, epoch: placement.epoch, scopes: permitted,
        issuedAt, notBefore: issuedAt, expiresAt, ticketId: randomUUID(),
        ...(identity.sessionBinding ? { sessionBinding: identity.sessionBinding } : {}),
      });
      const descriptor: DatafnRegionalRouteDescriptor = {
        version: 1, httpUrl, ...(wsUrl ? { wsUrl } : {}), ticket,
        expiresAt, renewAfter: issuedAt + Math.floor((expiresAt - issuedAt) * 0.8),
      };
      emit(config, { type: "issued" });
      return Response.json(descriptor, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
    } catch (error) {
      emit(config, { type: "rejected", code: error instanceof DatafnRoutingError ? error.code : "DATAFN_ROUTE_FORBIDDEN" });
      return (error instanceof DatafnRoutingError ? error : routeTicketError("DATAFN_ROUTE_FORBIDDEN")).toResponse();
    }
  };
}

export interface DatafnRegionalTicketRuntime {
  /** Browser HTTP/WS origins. An Origin header is rejected unless explicitly allowed. */
  allowedOrigins?: readonly string[];
  verifier: DatafnRouteTicketVerifier;
  issuer: string;
  audience: string;
  /** Validates application credentials separately from the route grant. Also used on WS handshakes. */
  authenticate(request: Request): Promise<DatafnRouteIdentity> | DatafnRouteIdentity;
  /** Checks ticket/session revocation on each HTTP request and WS admission. False rejects. */
  isActive?(claims: DatafnRouteTicketClaims): Promise<boolean> | boolean;
  /** Optional provider-neutral limiter before plugin authorization/execution. */
  allowRequest?(claims: DatafnRouteTicketClaims): Promise<boolean> | boolean;
  now?: () => number;
  /** Future issuance/not-before tolerance only. Expiry is never extended. Default 5 seconds. */
  clockSkewMs?: number;
  onEvent?(event: DatafnRouteTicketEvent): void;
}

/** The adapter must negotiate only datafn-sync-v1, never echo the ticket subprotocol. */
export function readDatafnRouteTicket(request: Request, websocket = false): string | undefined {
  const header = request.headers.get(DATAFN_ROUTE_TICKET_HEADER);
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const tickets = protocols.filter(s => s.startsWith(DATAFN_ROUTE_WS_TICKET_PREFIX));
  if (tickets.length > 1 || (header && tickets.length) || (!websocket && tickets.length) ||
    (tickets.length && !protocols.includes(DATAFN_ROUTE_WS_PROTOCOL))) throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
  return header ?? tickets[0]?.slice(DATAFN_ROUTE_WS_TICKET_PREFIX.length);
}

export async function validateDatafnRouteTicket(input: {
  request: Request; namespace: string; regionId: string; scope: DatafnRouteScope;
  runtime: DatafnRegionalTicketRuntime;
}): Promise<DatafnRouteTicketClaims> {
  const { runtime } = input;
  try {
    const origin = input.request.headers.get("origin");
    if (origin && !runtime.allowedOrigins?.includes(origin)) throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
    const token = readDatafnRouteTicket(input.request, input.scope === "websocket");
    if (!token) throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
    const claims = await runtime.verifier.verify(token);
    assertClaims(claims);
    const now = (runtime.now ?? Date.now)();
    const skew = runtime.clockSkewMs ?? 5000;
    if (!Number.isFinite(skew) || skew < 0 || skew > 30_000) throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
    if (claims.expiresAt <= now) throw routeTicketError("DATAFN_ROUTE_TICKET_EXPIRED");
    if (claims.issuedAt > now + skew || claims.notBefore > now + skew ||
      claims.issuer !== runtime.issuer || claims.audience !== runtime.audience ||
      claims.regionId !== input.regionId || claims.namespace !== input.namespace ||
      !claims.scopes.includes(input.scope)) throw routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
    const identity = await runtime.authenticate(input.request);
    if (!identity || identity.subject !== claims.subject || identity.namespace !== claims.namespace ||
      identity.sessionBinding !== claims.sessionBinding ||
      (identity.expiresAt !== undefined && (!Number.isFinite(identity.expiresAt) || (identity.expiresAt <= (runtime.now ?? Date.now)() || claims.expiresAt > identity.expiresAt)))) {
      throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
    }
    if (runtime.isActive && !await runtime.isActive(claims)) throw routeTicketError("DATAFN_ROUTE_TICKET_REVOKED");
    if (runtime.allowRequest && !await runtime.allowRequest(claims)) throw routeTicketError("DATAFN_ROUTE_RATE_LIMITED");
    const admittedAt = (runtime.now ?? Date.now)();
    if (identity.expiresAt !== undefined && identity.expiresAt <= admittedAt) throw routeTicketError("DATAFN_ROUTE_FORBIDDEN");
    if (claims.expiresAt <= admittedAt) throw routeTicketError("DATAFN_ROUTE_TICKET_EXPIRED");
    emit(runtime, { type: "accepted" });
    return claims;
  } catch (error) {
    const safe = error instanceof DatafnRoutingError ? error : routeTicketError("DATAFN_ROUTE_TICKET_INVALID");
    emit(runtime, { type: "rejected", code: safe.code });
    throw safe;
  }
}

/** Wrap regional HTTP ingress, including preflight. No credentials/cookies or wildcard origins. */
export function withDatafnRegionalCors(
  handler: (request: Request) => Promise<Response>,
  options: { origins: readonly string[]; headers?: readonly string[] },
): (request: Request) => Promise<Response> {
  const origins = new Set(options.origins.map(origin => {
    if (new URL(origin).origin !== origin || origin === "null") throw new Error("DATAFN_ROUTE_ORIGIN_INVALID");
    return origin;
  }));
  const allowedHeaders = new Set(["content-type", "authorization", DATAFN_ROUTE_TICKET_HEADER,
    ...(options.headers ?? []).map(header => header.toLowerCase())]);
  return async request => {
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) return routeTicketError("DATAFN_ROUTE_FORBIDDEN").toResponse();
    if (request.method === "OPTIONS") {
      const method = request.headers.get("access-control-request-method");
      const headers = (request.headers.get("access-control-request-headers") ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!origin || !["GET", "POST"].includes(method ?? "") || headers.some(h => !allowedHeaders.has(h))) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": [...allowedHeaders].join(", "),
        vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
        "cache-control": "no-store",
      } });
    }
    const response = await handler(request);
    const headers = new Headers(response.headers);
    headers.append("vary", "Origin");
    headers.delete("access-control-allow-credentials");
    headers.set("cache-control", "no-store");
    if (origin) headers.set("access-control-allow-origin", origin);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

function emit(config: { onEvent?(event: DatafnRouteTicketEvent): void }, event: DatafnRouteTicketEvent) {
  try { config.onEvent?.(event); } catch { /* Telemetry cannot affect execution. */ }
}
