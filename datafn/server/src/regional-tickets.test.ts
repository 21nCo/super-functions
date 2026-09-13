import { describe, expect, it, vi } from "vitest";
import { DATAFN_ROUTE_TICKET_HEADER, type DatafnRouteScope } from "@datafn/core";
import {
  createDatafnHmacRouteTickets, createDatafnRouteBootstrap, validateDatafnRouteTicket,
  withDatafnRegionalCors, type DatafnRouteTicketClaims,
} from "./regional-tickets.js";
import {
  createDatafnHmacRoutingAssertions,
  createMemoryDatafnRoutingReplayStore,
  claimDatafnNamespacePlacement, createMemoryDatafnPlacementDirectory,
  validateDatafnPlacement,
} from "./multi-region-routing.js";

const now = 1_800_000_000_000;
const signer = createDatafnHmacRouteTickets({ activeKeyId: "a", keys: { a: "a".repeat(32) } });
function claims(overrides: Partial<DatafnRouteTicketClaims> = {}): DatafnRouteTicketClaims {
  return { version: 1, issuer: "canonical", audience: "prod-eu", subject: "opaque-user", namespace: "tenant",
    regionId: "eu", epoch: 1, scopes: ["query", "mutation", "websocket"], issuedAt: now,
    notBefore: now, expiresAt: now + 60_000, ticketId: "grant-1", ...overrides };
}
const request = (ticket: string) => new Request("https://eu.example/datafn/query", { headers: { [DATAFN_ROUTE_TICKET_HEADER]: ticket } });
const runtime = () => ({ verifier: signer, issuer: "canonical", audience: "prod-eu", now: () => now,
  authenticate: () => ({ namespace: "tenant", subject: "opaque-user" }) });
const verify = (value: DatafnRouteTicketClaims, scope: DatafnRouteScope = "query") =>
  validateDatafnRouteTicket({ request: request(signer.sign(value) as string), namespace: "tenant", regionId: "eu", scope, runtime: runtime() });

describe("regional route grants", () => {
  it("reuses a bounded grant independently of internal request nonces", async () => {
    await expect(verify(claims())).resolves.toEqual(claims());
    await expect(verify(claims(), "mutation")).resolves.toEqual(claims());
  });

  it.each([
    ["issuer", { issuer: "evil" }], ["audience", { audience: "other" }],
    ["subject", { subject: "other" }], ["namespace", { namespace: "other" }],
    ["region", { regionId: "us" }], ["scope", { scopes: ["mutation"] }],
    ["future issuance", { issuedAt: now + 6000, notBefore: now + 6000 }],
    ["not before", { notBefore: now + 6000 }],
    ["session", { sessionBinding: "other-session" }],
  ] as [string, Partial<DatafnRouteTicketClaims>][])('rejects %s binding', async (_name, patch) => {
    await expect(verify(claims(patch))).rejects.toMatchObject({ executionStarted: false });
  });

  it("uses strict expiry and a bounded future clock allowance", async () => {
    await expect(verify(claims({ issuedAt: now - 60_000, notBefore: now - 60_000, expiresAt: now })))
      .rejects.toMatchObject({ code: "DATAFN_ROUTE_TICKET_EXPIRED" });
    await expect(verify(claims({ issuedAt: now + 5000, notBefore: now + 5000 }))).resolves.toBeTruthy();
    expect(() => signer.sign(claims({ expiresAt: now + 300_001 }))).toThrow();
  });

  it("rejects tampering, oversized tokens, internal assertions and algorithm/key confusion", async () => {
    const ticket = signer.sign(claims()) as string;
    const [header, payload, signature] = ticket.split(".");
    const encode = (object: unknown) => Buffer.from(JSON.stringify(object)).toString("base64url");
    for (const token of [
      `${header}.${encode(claims({ namespace: "other" }))}.${signature}`,
      `${encode({ typ: "datafn-route-v1", alg: "none", kid: "a" })}.${payload}.${signature}`,
      `${encode({ typ: "datafn-route-v1", alg: "HS256", kid: "missing" })}.${payload}.${signature}`,
      "a".repeat(17_000), "a.payload.signature",
    ]) expect(() => signer.verify(token)).toThrow("DATAFN_ROUTE_TICKET_INVALID");
  });

  it("supports active/previous keys and emergency removal", () => {
    const old = signer.sign(claims()) as string;
    const rotated = createDatafnHmacRouteTickets({ activeKeyId: "b", keys: { a: "a".repeat(32), b: "b".repeat(32) } });
    expect(rotated.verify(old)).toEqual(claims());
    const current = rotated.sign(claims()) as string;
    const revoked = createDatafnHmacRouteTickets({ activeKeyId: "b", keys: { b: "b".repeat(32) } });
    expect(() => revoked.verify(old)).toThrow();
    expect(revoked.verify(current)).toEqual(claims());
    expect(() => createDatafnHmacRouteTickets({ activeKeyId: "a", keys: { a: "short" } })).toThrow();
  });

  it("checks application revocation and rate limits without leaking identity", async () => {
    for (const [key, code] of [["isActive", "DATAFN_ROUTE_TICKET_REVOKED"], ["allowRequest", "DATAFN_ROUTE_RATE_LIMITED"]]) {
      const onEvent = vi.fn();
      await expect(validateDatafnRouteTicket({ request: request(signer.sign(claims()) as string), namespace: "tenant", regionId: "eu", scope: "query",
        runtime: { ...runtime(), [key]: () => false, onEvent } }))
        .rejects.toMatchObject({ code, executionStarted: false });
      expect(JSON.stringify(onEvent.mock.calls)).not.toContain("opaque-user");
    }
  });

  it("requires a ticket, prevents downgrade/spoofed headers, and fences old epochs", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({ directory, namespace: "tenant", regionId: "eu" });
    const validate = (req?: Request) => validateDatafnPlacement({ directory, namespace: "tenant", regionId: "eu", request: req,
      scope: "query", runtime: { directory, routeTickets: runtime() } } as Parameters<typeof validateDatafnPlacement>[0]);
    await expect(validate(new Request("https://eu.example/query"))).rejects.toMatchObject({ code: "DATAFN_ROUTE_TICKET_INVALID" });
    for (const value of ["", " "]) {
      await expect(validate(new Request("https://eu.example/query", {
        headers: { "x-datafn-routing-assertion": value },
      }))).rejects.toMatchObject({ code: "DATAFN_ROUTE_TICKET_INVALID" });
    }
    const forged = request(signer.sign(claims()) as string);
    forged.headers.set("x-datafn-routing-region", "us");
    await expect(validate(forged)).rejects.toMatchObject({ code: "DATAFN_ROUTE_TICKET_INVALID" });
    await expect(validate(request(signer.sign(claims()) as string))).resolves.toHaveProperty("ticket");
    const placement = (await directory.get("tenant"))!;
    await directory.compareAndSet({ namespace: "tenant", expectedEpoch: 1, next: { ...placement, epoch: 2 } });
    await expect(validate(request(signer.sign(claims()) as string))).rejects.toMatchObject({ code: "DATAFN_REGION_MISMATCH", executionStarted: false });
    await expect(validateDatafnPlacement({ namespace: "tenant", regionId: "eu", trustedInternal: true,
      runtime: { directory, routeTickets: runtime() } })).resolves.toBeTruthy();
  });

  it("fails closed on directory outage and expiry while awaiting authentication", async () => {
    let clock = now;
    await expect(validateDatafnRouteTicket({ request: request(signer.sign(claims()) as string), namespace: "tenant", regionId: "eu", scope: "query",
      runtime: { ...runtime(), now: () => clock, authenticate: async () => {
        clock += 60_000;
        return { namespace: "tenant", subject: "opaque-user" };
      } } })).rejects.toMatchObject({ code: "DATAFN_ROUTE_TICKET_EXPIRED" });
    const directory = createMemoryDatafnPlacementDirectory();
    vi.spyOn(directory, "get").mockRejectedValue(new Error("directory offline"));
    await expect(validateDatafnPlacement({ namespace: "tenant", regionId: "eu", scope: "query",
      request: request(signer.sign(claims()) as string), runtime: { directory, routeTickets: runtime() } }))
      .rejects.toMatchObject({ code: "DATAFN_PLACEMENT_UNAVAILABLE", executionStarted: false });
  });

  it("retains canonical assertion validation alongside public ticket ingress", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({ directory, namespace: "tenant", regionId: "eu" });
    const assertions = createDatafnHmacRoutingAssertions({ activeKeyId: "internal", keys: { internal: "internal-key" }, now: () => now });
    const assertion = await assertions.sign({ version: 1, namespace: "tenant", regionId: "eu", epoch: 1,
      requestId: "request-1", method: "GET", path: "/query", audience: "datafn-cell",
      issuedAt: now, expiresAt: now + 1000, nonce: "once-only" });
    const request = new Request("https://eu.example/query", { headers: { "x-datafn-routing-assertion": assertion } });
    const config = { directory, routeTickets: runtime(), requireRoutingAssertion: true,
      assertionVerifier: assertions, replayStore: createMemoryDatafnRoutingReplayStore({ now: () => now }) };
    await expect(validateDatafnPlacement({ namespace: "tenant", regionId: "eu", request, runtime: config }))
      .resolves.toHaveProperty("assertion");
    await expect(validateDatafnPlacement({ namespace: "tenant", regionId: "eu", request, runtime: config }))
      .rejects.toMatchObject({ code: "DATAFN_ROUTING_ASSERTION_INVALID" });
  });

  it("bootstraps only server-owned placement/endpoints and bounds lifetime by auth expiry", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({ directory, namespace: "tenant", regionId: "eu" });
    const resolveEndpoint = vi.fn(() => ({ httpUrl: "https://eu.example/datafn", wsUrl: "wss://eu.example/ws", audience: "prod-eu" }));
    const bootstrap = createDatafnRouteBootstrap({ directory, signer, issuer: "canonical", now: () => now,
      authenticate: () => ({ subject: "opaque-user", namespace: "tenant", expiresAt: now + 10_000 }),
      authorize: () => ["query", "websocket"], resolveEndpoint });
    const response = await bootstrap(new Request("https://canonical.example/bootstrap", { method: "POST",
      body: JSON.stringify({ regionId: "us", namespace: "other", httpUrl: "https://evil.example" }) }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const route = await response.json() as import("@datafn/core").DatafnRegionalRouteDescriptor;
    expect(route).toMatchObject({ httpUrl: "https://eu.example/datafn", expiresAt: now + 10_000 });
    expect(signer.verify(route.ticket)).toMatchObject({ regionId: "eu", namespace: "tenant", subject: "opaque-user" });
    expect(route).not.toHaveProperty("regionId");
    const old = (await directory.get("tenant"))!;
    await directory.compareAndSet({ namespace: "tenant", expectedEpoch: 1, next: { ...old, state: "moving", epoch: 2 } });
    expect((await bootstrap(new Request("https://canonical.example/bootstrap", { method: "POST" }))).status).toBe(409);
    expect(resolveEndpoint).toHaveBeenCalledTimes(1);
  });

  it("validates WS subprotocol transport and rejects URL tokens and untrusted browser origins", async () => {
    const token = signer.sign(claims()) as string;
    const wsRequest = new Request("https://eu.example/ws", { headers: { "sec-websocket-protocol": `datafn-sync-v1, datafn-ticket.${token}` } });
    await expect(validateDatafnRouteTicket({ request: wsRequest, namespace: "tenant", regionId: "eu", scope: "websocket", runtime: runtime() })).resolves.toBeTruthy();
    for (const req of [new Request(`https://eu.example/ws?ticket=${token}`),
      new Request(wsRequest, { headers: { "sec-websocket-protocol": `datafn-sync-v1, datafn-ticket.${token}, datafn-ticket.${token}` } }),
      new Request(wsRequest, { headers: { [DATAFN_ROUTE_TICKET_HEADER]: token, origin: "https://evil.example" } })]) {
      await expect(validateDatafnRouteTicket({ request: req, namespace: "tenant", regionId: "eu", scope: "websocket", runtime: runtime() })).rejects.toBeTruthy();
    }
  });

  it("handles CORS preflight before application/placement access and never allows cookies", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const cors = withDatafnRegionalCors(handler, { origins: ["https://app.example"] });
    const preflight = await cors(new Request("https://eu.example/datafn/query", { method: "OPTIONS", headers: {
      origin: "https://app.example", "access-control-request-method": "POST", "access-control-request-headers": "authorization, x-datafn-route-ticket",
    } }));
    expect(preflight.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
    expect(preflight.headers.has("access-control-allow-credentials")).toBe(false);
    expect((await cors(new Request("https://eu.example/datafn/query", { headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await cors(new Request("https://eu.example/datafn/query", { headers: { origin: "https://app.example" } }))).headers.get("access-control-allow-origin")).toBe("https://app.example");
  });
});
