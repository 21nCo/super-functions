import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter, createMemoryIndexedDirectoryStore } from "@superfunctions/db/adapters";
import { createDatafnClient, createDatafnHttpRouteProvider, DefaultHttpTransport, MemoryStorageAdapter } from "@datafn/client";
import type { DatafnRouteScope } from "@datafn/core";
import { createDatafnServer } from "../server.js";
import { datafnMultiRegionPlugin } from "../plugins/multi-region.js";
import { createDatafnHmacRouteTickets, createDatafnRouteBootstrap, withDatafnRegionalCors, type DatafnRegionalEndpoint } from "../regional-tickets.js";
import { claimDatafnNamespacePlacement, createMemoryDatafnPlacementDirectory, migrateDatafnNamespace } from "../multi-region-routing.js";
import { INTERNAL_TABLE_SCHEMAS } from "../execution/internal-tables.js";

const schema = { resources: [{ name: "note", version: 1, fields: [{ name: "title", type: "string" as const, required: false }] }] };
const allScopes = ["query", "mutation", "transact", "pull", "push", "reconcile", "clone", "seed", "search", "websocket"] satisfies DatafnRouteScope[];
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
  vi.unstubAllGlobals();
});

function asRequest(req: IncomingMessage, origin: string, body?: Buffer): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(`${origin}${req.url}`, { method: req.method, headers,
    ...(body?.length ? { body: new Uint8Array(body) } : {}) });
}
async function listen(handler: (request: Request) => Promise<Response>) {
  const paths: string[] = [];
  let origin = "";
  const http = createServer(async (req, res) => {
    try {
      paths.push(req.url!);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const response = await handler(asRequest(req, origin, Buffer.concat(chunks)));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  cleanups.push(async () => { http.closeAllConnections(); await new Promise<void>((resolve) => http.close(() => resolve())); });
  return { http, origin, paths };
}

async function fixture(ttlMs = 60_000, allowRequest?: () => boolean) {
  const directory = createMemoryDatafnPlacementDirectory();
  await claimDatafnNamespacePlacement({ directory, namespace: "tenant", regionId: "eu" });
  const signer = createDatafnHmacRouteTickets({ activeKeyId: "test", keys: { test: "x".repeat(32) } });
  const endpoints: Record<string, DatafnRegionalEndpoint> = {};
  let sessionExpiresAt: number | undefined;
  const auth = (request: Request): { namespace: string; subject: string; expiresAt?: number } => {
    const authenticated = request.headers.get("authorization") === "Bearer app-session" ||
      request.headers.get("sec-websocket-protocol")?.split(",").map(s => s.trim()).includes("app-session.test");
    if (!authenticated) throw new Error("Unauthenticated");
    return { namespace: "tenant", subject: "opaque-subject", expiresAt: sessionExpiresAt };
  };
  async function cell(regionId: string) {
    const db = memoryAdapter();
    const authorize = vi.fn(() => true);
    const server = await createDatafnServer({ schema, database: db, allowUnknownResources: true, rest: true,
      context: auth, namespaceProvider: { getNamespace: (context: { namespace: string }) => context.namespace },
      plugins: [datafnMultiRegionPlugin({ regionId, directory: createMemoryIndexedDirectoryStore(),
        placement: { directory, routeTickets: { verifier: signer, issuer: "app", audience: regionId, authenticate: auth, allowRequest, allowedOrigins: ["https://app.example"] } } })], authorize,
      searchProvider: { name: "test", search: async () => [], searchAll: async () => [], updateIndices: async () => {} },
    });
    cleanups.push(() => server.close());
    const ingress = await listen(withDatafnRegionalCors(request => server.router.handle(request), { origins: ["https://app.example"] }));
    const wss = new WebSocketServer({ noServer: true, handleProtocols: protocols => protocols.has("datafn-sync-v1") ? "datafn-sync-v1" : false });
    const admitted: WebSocket[] = [];
    ingress.http.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, async ws => {
        ws.on("error", () => {});
        const request = asRequest(req, ingress.origin);
        try {
          const context = auth(request);
          if (await server.websocketHandler.addRoutedClient(ws, context, request)) {
            admitted.push(ws);
            ws.on("message", data => server.websocketHandler.handleMessage(ws, data.toString()));
            ws.on("close", () => server.websocketHandler.removeClient(ws));
          }
        } catch { ws.close(4403, "Unauthenticated"); }
      });
    });
    cleanups.push(async () => { for (const ws of wss.clients) ws.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); });
    endpoints[regionId] = { httpUrl: `${ingress.origin}/datafn`, wsUrl: `${ingress.origin.replace("http:", "ws:")}/ws`, audience: regionId };
    return { db, server, ingress, admitted, authorize };
  }
  const eu = await cell("eu"), us = await cell("us");
  let gatewayAvailable = true;
  const bootstrap = createDatafnRouteBootstrap({ directory, signer, issuer: "app", ttlMs, authenticate: auth,
    authorize: () => allScopes, resolveEndpoint: placement => endpoints[placement.regionId] });
  const gateway = await listen(request => gatewayAvailable ? bootstrap(request) : Promise.resolve(new Response(null, { status: 503 })));
  const provider = createDatafnHttpRouteProvider({ bootstrapUrl: `${gateway.origin}/bootstrap`, headers: () => ({ authorization: "Bearer app-session" }) });
  const transport = new DefaultHttpTransport("", { routeProvider: provider, headers: { authorization: "Bearer app-session" } });
  cleanups.push(() => transport.dispose());
  return { directory, eu, us, gateway, provider, transport, signer, setSessionDeadline: (value: number) => { sessionExpiresAt = value; }, setGatewayAvailable: (value: boolean) => { gatewayAvailable = value; } };
}
const mutation = (id: string, mutationId = id) => ({ resource: "note", version: 1, operation: "insert", id: `note:${id}`, clientId: "client:one", mutationId, record: { title: id } });

describe("direct regional two-region network conformance", () => {
  it.each(["query", "mutate", "transact", "search"] as const)("allows trusted executor %s while retaining placement fencing", async operation => {
    const f = await fixture();
    const context = { namespace: "tenant", subject: "opaque-subject" };
    const invoke = (server: typeof f.eu.server) => {
      switch (operation) {
        case "query": return server.executor.query({ resource: "note", version: 1 }, context);
        case "mutate": return server.executor.mutate(mutation("internal"), context);
        case "transact": return server.executor.transact({ steps: [mutation("transaction")] }, context);
        case "search": return server.executor.search({ query: "example", resources: ["note"] }, context);
      }
    };
    await expect(invoke(f.eu.server)).resolves.toBeDefined();
    await expect(invoke(f.us.server)).rejects.toMatchObject({ code: "DATAFN_REGION_MISMATCH" });
    expect(f.us.authorize).not.toHaveBeenCalled();
    // Neither the synthetic executor host nor a client-supplied flag conveys trust.
    const response = await f.eu.server.router.handle(new Request("http://datafn.internal/datafn/query", {
      method: "POST", headers: { authorization: "Bearer app-session", "x-datafn-trusted-internal": "true" },
      body: JSON.stringify({ resource: "note", version: 1, trustedInternal: true }),
    }));
    expect(response.status).toBe(401);
    const placement = (await f.directory.get("tenant"))!;
    await f.directory.compareAndSet({ namespace: "tenant", expectedEpoch: placement.epoch,
      next: { ...placement, epoch: placement.epoch + 1, state: "moving" } });
    await expect(invoke(f.eu.server)).rejects.toMatchObject({ code: "DATAFN_NAMESPACE_MOVING" });
  });

  it("permits cross-origin REST updates and deletes while retaining ticket admission", async () => {
    const f = await fixture();
    await f.transport.mutation(mutation("rest"));
    const descriptor = await f.transport.regionalRoutes!.get();
    const url = `${descriptor.httpUrl}/resources/note/note:rest?clientId=client:rest`;
    const headers = { origin: "https://app.example", authorization: "Bearer app-session",
      "content-type": "application/json", "x-datafn-route-ticket": descriptor.ticket };
    for (const method of ["PATCH", "DELETE"]) {
      f.eu.authorize.mockClear();
      const preflight = await fetch(url, { method: "OPTIONS", headers: {
        origin: headers.origin, "access-control-request-method": method,
        "access-control-request-headers": "content-type, authorization, x-datafn-route-ticket",
      } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-methods")?.split(", ")).toContain(method);
      expect(f.eu.authorize).not.toHaveBeenCalled();
      const init = { method, headers, ...(method === "PATCH" ? { body: JSON.stringify({ record: { title: "updated" } }) } : {}) };
      const denied = await fetch(`${url}&mutationId=denied-${method}`, {
        ...init, headers: { ...headers, "x-datafn-route-ticket": "forged" },
      });
      expect(denied.status).toBe(401);
      expect(f.eu.authorize).not.toHaveBeenCalled();
      const response = await fetch(`${url}&mutationId=${method}`, init);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(response.headers.get("access-control-allow-origin")).toBe(headers.origin);
      expect(response.headers.has("access-control-allow-credentials")).toBe(false);
      const result = await f.transport.query({ resource: "note", version: 1, select: ["id", "title"] }) as any;
      expect(result.result.data).toEqual(method === "PATCH" ? [{ id: "note:rest", title: "updated" }] : []);
    }
  });

  it("recovers writes made in a disconnected interval from the saved checkpoint", async () => {
    vi.stubGlobal("WebSocket", WebSocket);
    const f = await fixture();
    await f.transport.mutation(mutation("before-gap"));
    const storage = new MemoryStorageAdapter(["note"]);
    let pauseReconnect = false, waiting = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    cleanups.push(() => release());
    const pulls: Array<{ cursors: Record<string, string> }> = [];
    const client = createDatafnClient({ schema, clientId: "client:gap", storage,
      sync: { routeProvider: f.provider, offlinability: true, ws: true,
        http: { headers: { authorization: "Bearer app-session" }, fetch: async (input, init) => {
          if (String(input).endsWith("/pull")) pulls.push(JSON.parse(String(init?.body)));
          return fetch(input, init);
        } },
        wsProtocols: async () => { if (pauseReconnect) { waiting = true; await gate; } return ["app-session.test"]; },
        wsReconnect: { baseDelayMs: 10, jitterMs: 0 },
      } });
    cleanups.push(() => client.destroy());
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    const checkpoint = await storage.getCursor("note");
    pauseReconnect = true;
    f.eu.server.websocketHandler.fenceNamespace("tenant");
    await vi.waitFor(() => expect(waiting).toBe(true));
    await f.transport.mutation(mutation("missed-during-gap"));
    expect(await storage.getRecord("note", "note:missed-during-gap")).toBeNull();
    const before = pulls.length;
    release();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(2));
    await vi.waitFor(async () => expect(await storage.getRecord("note", "note:missed-during-gap"))
      .toMatchObject({ title: "missed-during-gap" }));
    expect(pulls.length).toBeGreaterThan(before);
    expect(pulls[before].cursors.note).toBe(checkpoint);
  });

  it("reports temporary WebSocket rate limiting with a retryable close code", async () => {
    const f = await fixture(60_000, () => false);
    const descriptor = await f.provider.bootstrap();
    const ws = new WebSocket(descriptor.wsUrl!, ["datafn-sync-v1", `datafn-ticket.${descriptor.ticket}`, "app-session.test"]);
    cleanups.push(() => ws.terminate());
    const closed = await once(ws, "close");
    expect(closed[0]).toBe(4503);
    expect(closed[1].toString()).toBe("DATAFN_ROUTE_RATE_LIMITED");
    expect(f.eu.admitted).toHaveLength(0);
  });

  it("bootstraps once, executes real query/mutation/sync directly, then migrates records, cursors and dedup state", async () => {
    const f = await fixture();
    const write: any = await f.transport.mutation(mutation("first"));
    expect(write, JSON.stringify(write)).toMatchObject({ ok: true });
    expect((await f.transport.query({ resource: "note", version: 1, select: ["id", "title"] }) as any).result.data).toEqual([{ id: "note:first", title: "first" }]);
    const pushed: any = await f.transport.push({ clientId: "client:one", mutations: [mutation("second")] });
    expect(pushed.result.ok).toBe(true);
    const pulled: any = await f.transport.pull({ clientId: "reader", cursor: "0", limit: 100 });
    expect(pulled.result.ok).toBe(true);
    const checkpoint = pulled.result.nextCursor;
    expect(typeof checkpoint).toBe("string");
    expect((await f.transport.reconcile({ clientId: "reader", resources: ["note"] }) as any).result.counts.note).toBe(2);
    expect((await f.transport.clone({ clientId: "reader", tables: ["note"] }) as any).result.data.note).toHaveLength(2);
    expect(f.gateway.paths).toEqual(["/bootstrap"]);
    expect(f.us.ingress.paths).toEqual([]);

    const before = await f.transport.regionalRoutes!.get();
    const ws = new WebSocket(before.wsUrl!, ["datafn-sync-v1", `datafn-ticket.${before.ticket}`, "app-session.test"]);
    cleanups.push(() => ws.terminate());
    await once(ws, "open");
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    expect(ws.protocol).toBe("datafn-sync-v1");
    const closed = once(ws, "close");
    await migrateDatafnNamespace({ directory: f.directory, namespace: "tenant", targetRegionId: "us", hooks: {
      async quiesceSource() { f.eu.server.websocketHandler.fenceNamespace("tenant"); },
      async drainPermissionDirectory() {},
      async copyTenantData() {
        const records = await f.eu.db.findMany({ model: "note", where: [] });
        for (const record of records) await f.us.db.create({ model: "note", data: record });
        for (const [table, columns] of Object.entries(INTERNAL_TABLE_SCHEMAS)) {
          await f.us.db.internal.ensureTable(table, columns);
          for (const row of await f.eu.db.internal.findMany(table, [])) await f.us.db.internal.create(table, row);
        }
      },
      async validateTenantData() { expect(await f.us.db.findMany({ model: "note", where: [] })).toHaveLength(2); },
      async rebuildPermissionDirectory() {}, async warmTarget() {}, async resumeTarget() {}, async rollbackSource() {},
    } });
    expect((await closed)[0]).toBe(4510);
    const afterPull: any = await f.transport.pull({ clientId: "reader", cursor: checkpoint, limit: 100 });
    expect(afterPull.result.ok).toBe(true);
    expect(afterPull.result.changes).toEqual([]);
    const dedup: any = await f.transport.push({ clientId: "client:one", mutations: [mutation("second")] });
    expect(dedup.result.ok).toBe(true);
    expect((await f.transport.reconcile({ clientId: "reader", resources: ["note"] }) as any).result.counts.note).toBe(2);
    expect(f.gateway.paths).toEqual(["/bootstrap", "/bootstrap"]);
    expect(f.us.ingress.paths).toContain("/datafn/push");
    // Every late source request is fenced before application authorization.
    const authCalls = f.eu.authorize.mock.calls.length;
    const rejected = await fetch(`${before.httpUrl}/mutation`, { method: "POST", headers: { authorization: "Bearer app-session", "x-datafn-route-ticket": before.ticket }, body: JSON.stringify(mutation("stale")) });
    expect(rejected.status).toBe(409);
    expect(f.eu.authorize).toHaveBeenCalledTimes(authCalls);
  });

  it("supports the public HTTP-only client with no fixed remote or local storage", async () => {
    const f = await fixture();
    const client = createDatafnClient({ schema, clientId: "client:one",
      sync: { routeProvider: f.provider, http: { headers: { authorization: "Bearer app-session" } } } });
    cleanups.push(() => client.destroy());
    expect(await client.mutate(mutation("public"))).toMatchObject({ ok: true });
    expect(await client.query({ resource: "note", version: 1, select: ["id", "title"] }))
      .toMatchObject({ data: [{ id: "note:public", title: "public" }] });
    expect(f.gateway.paths).toEqual(["/bootstrap"]);
    expect(f.us.ingress.paths).toEqual([]);
  });

  it("uses the public DataFn client to reconnect through bootstrap after 4510 without losing its checkpoint", async () => {
    vi.stubGlobal("WebSocket", WebSocket);
    const f = await fixture();
    const storage = new MemoryStorageAdapter(["note"]);
    const client = createDatafnClient({ schema, clientId: "client:ui", storage,
      sync: { routeProvider: f.provider, offlinability: true, ws: true,
        http: { headers: { authorization: "Bearer app-session" } }, wsProtocols: () => ["app-session.test"],
        wsReconnect: { baseDelayMs: 10, jitterMs: 0 },
      } });
    cleanups.push(() => client.destroy());
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    const checkpoint = await storage.getCursor("__global_cursor__");
    f.eu.server.websocketHandler.fenceNamespace("tenant");
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(2));
    expect(f.gateway.paths).toEqual(["/bootstrap", "/bootstrap"]);
    expect(await storage.getCursor("__global_cursor__")).toBe(checkpoint);
    client.sync.stop();
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(3));
  });

  it("reuses valid HTTP and socket routes after transient disconnect during gateway outage", async () => {
    vi.stubGlobal("WebSocket", WebSocket);
    const f = await fixture();
    const client = createDatafnClient({ schema, clientId: "transient", storage: new MemoryStorageAdapter(["note"]),
      sync: { routeProvider: f.provider, offlinability: true, ws: true,
        http: { headers: { authorization: "Bearer app-session" } }, wsProtocols: () => ["app-session.test"],
        wsReconnect: { baseDelayMs: 10, jitterMs: 0 } } });
    cleanups.push(() => client.destroy());
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    f.setGatewayAvailable(false);
    f.eu.admitted[0].terminate();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(2), { timeout: 6000 });
    await expect(client.query({ resource: "note", version: 1 })).resolves.toBeDefined();
    expect(f.gateway.paths).toEqual(["/bootstrap"]);
  }, 10_000);

  it("keeps established regional traffic through a gateway outage only until expiry and closes sockets with 4511", async () => {
    const f = await fixture(3000);
    await f.transport.query({ resource: "note", version: 1 });
    const descriptor = await f.transport.regionalRoutes!.get();
    const ws = new WebSocket(descriptor.wsUrl!, ["datafn-sync-v1", `datafn-ticket.${descriptor.ticket}`, "app-session.test"]);
    cleanups.push(() => ws.terminate());
    await once(ws, "open");
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    const closed = once(ws, "close");
    f.setGatewayAvailable(false);
    expect((await f.transport.query({ resource: "note", version: 1 }) as any).ok).toBe(true);
    expect((await closed)[0]).toBe(4511);
    await expect(f.transport.query({ resource: "note", version: 1 })).rejects.toMatchObject({ code: "DATAFN_ROUTE_BOOTSTRAP_UNAVAILABLE" });
  }, 10_000);

  it("renews a live public client socket before expiry through the canonical provider", async () => {
    vi.stubGlobal("WebSocket", WebSocket);
    const f = await fixture(3000);
    const client = createDatafnClient({ schema, clientId: "client:renew", storage: new MemoryStorageAdapter(["note"]),
      sync: { routeProvider: f.provider, offlinability: true, ws: true,
        http: { headers: { authorization: "Bearer app-session" } }, wsProtocols: () => ["app-session.test"],
        wsReconnect: { baseDelayMs: 10, jitterMs: 0 },
      } });
    cleanups.push(() => client.destroy());
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(2), { timeout: 6000 });
    expect(f.gateway.paths).toEqual(["/bootstrap", "/bootstrap"]);
    expect(f.eu.admitted[1].readyState).toBe(WebSocket.OPEN);
    expect(f.us.admitted).toHaveLength(0);
  }, 10_000);

  it("revokes admitted tickets immediately and stops automatic client reconnect", async () => {
    vi.stubGlobal("WebSocket", WebSocket);
    const f = await fixture();
    const descriptors: import("@datafn/core").DatafnRegionalRouteDescriptor[] = [];
    const bootstrap = async () => { const value = await f.provider.bootstrap(); descriptors.push(value); return value; };
    const client = createDatafnClient({ schema, clientId: "client:revocation", storage: new MemoryStorageAdapter(["note"]),
      sync: { routeProvider: { bootstrap, renew: bootstrap }, offlinability: true, ws: true,
        http: { headers: { authorization: "Bearer app-session" } }, wsProtocols: () => ["app-session.test"],
        wsReconnect: { baseDelayMs: 10, jitterMs: 0 },
      } });
    cleanups.push(() => client.destroy());
    await client.sync.start();
    await vi.waitFor(() => expect(f.eu.admitted).toHaveLength(1));
    const ticket = await f.signer.verify(descriptors[0].ticket);
    const disconnected = new Promise<void>(resolve => {
      client.subscribe(event => { if (event.type === "ws_disconnected") resolve(); });
    });
    expect(f.eu.server.websocketHandler.revokeRouteTicket(ticket.ticketId)).toBe(1);
    await disconnected;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(f.eu.admitted).toHaveLength(1);
    expect(f.gateway.paths).toEqual(["/bootstrap"]);
  });

  it("refreshes a cached grant after the authenticated session deadline shortens", async () => {
    const f = await fixture();
    await f.transport.regionalRoutes!.get();
    f.setSessionDeadline(Date.now() + 30_000);
    expect((await f.transport.mutation(mutation("rotated")) as any).ok).toBe(true);
    expect(f.gateway.paths).toEqual(["/bootstrap", "/bootstrap"]);
    expect(f.eu.authorize).toHaveBeenCalledTimes(1);
  });

  it("does not let caller trust flags widen a valid ticket's scope", async () => {
    const f = await fixture();
    const descriptor = await f.provider.bootstrap();
    const claims = await f.signer.verify(descriptor.ticket);
    const token = await f.signer.sign({ ...claims, scopes: ["mutation"] });
    const response = await fetch(`${descriptor.httpUrl}/query`, { method: "POST",
      headers: { authorization: "Bearer app-session", "x-datafn-route-ticket": token, "x-datafn-trusted-internal": "true" },
      body: JSON.stringify({ resource: "note", version: 1, trustedInternal: true }) });
    expect(response.status).toBe(401);
    expect(f.eu.authorize).not.toHaveBeenCalled();
  });

  it("rejects missing/forged/wrong-namespace grants before every built-in regional operation", async () => {
    const f = await fixture();
    const valid = await f.provider.bootstrap();
    const claims = await f.signer.verify(valid.ticket);
    // Structurally valid payloads reach ticket admission after protocol parsing.
    const payloads: Record<Exclude<(typeof allScopes)[number], "websocket">, unknown> = {
      query: { resource: "note", version: 1 }, mutation: mutation("denied"),
      transact: { steps: [mutation("denied")] },
      pull: { clientId: "client:denied", cursors: { note: "0" } },
      push: { clientId: "client:denied", mutations: [mutation("denied")] },
      reconcile: { resources: ["note"] }, clone: { tables: ["note"] },
      seed: {}, search: { query: "example", resources: ["note"] },
    };
    for (const operation of allScopes.filter(scope => scope !== "websocket")) {
      for (const token of [undefined, `${valid.ticket}forged`, await f.signer.sign({ ...claims, namespace: "other" })]) {
        const response = await fetch(`${valid.httpUrl}/${operation}`, { method: "POST",
          headers: { authorization: "Bearer app-session", ...(token ? { "x-datafn-route-ticket": token } : {}) }, body: JSON.stringify(payloads[operation]) });
        expect(response.status).toBe(401);
      }
    }
    expect(f.eu.authorize).not.toHaveBeenCalled();
  });
});
