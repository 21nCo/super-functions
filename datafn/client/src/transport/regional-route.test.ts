import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatafnRegionalRouteDescriptor } from "@datafn/core";
import { DatafnRegionalRouteCache, createDatafnHttpRouteProvider } from "./regional-route.js";
import { DefaultHttpTransport } from "./http.js";

const route = (patch: Partial<DatafnRegionalRouteDescriptor> = {}): DatafnRegionalRouteDescriptor => ({
  version: 1, ticket: "header.payload.signature", httpUrl: "https://eu.example/datafn",
  wsUrl: "wss://eu.example/ws", expiresAt: Date.now() + 60_000, renewAfter: Date.now() + 48_000, ...patch,
});
afterEach(() => { vi.useRealTimers(); });

describe("direct regional client lifecycle", () => {
  it("single-flights bootstrap and proactive renewal, ignoring stale invalidation", async () => {
    vi.useFakeTimers();
    const provider = { bootstrap: vi.fn(async () => route()), renew: vi.fn(async () => route({ ticket: "new.ticket" })) };
    const cache = new DatafnRegionalRouteCache(provider);
    const [one, two] = await Promise.all([cache.get(), cache.get()]);
    expect(one).toBe(two);
    expect(provider.bootstrap).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(48_000);
    expect(provider.renew).toHaveBeenCalledTimes(1);
    expect((await cache.get()).ticket).toBe("new.ticket");
    cache.invalidate(one);
    expect((await cache.get()).ticket).toBe("new.ticket");
    cache.dispose();
    await expect(cache.get()).rejects.toMatchObject({ code: "DATAFN_ROUTE_DISPOSED" });
  });

  it("continues through a gateway outage only until expiry, including a hung renewal", async () => {
    vi.useFakeTimers();
    const provider = { bootstrap: vi.fn(async () => route()), renew: vi.fn(() => new Promise<DatafnRegionalRouteDescriptor>(() => {})) };
    const cache = new DatafnRegionalRouteCache(provider);
    await cache.get();
    await vi.advanceTimersByTimeAsync(48_000);
    expect((await cache.get()).httpUrl).toContain("eu.example");
    provider.bootstrap.mockRejectedValue(new Error("offline"));
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(cache.get()).rejects.toMatchObject({ code: "DATAFN_ROUTE_BOOTSTRAP_UNAVAILABLE" });
    expect(provider.bootstrap).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it("supersedes hung renewal when the clock expires before timers run", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    let clock = start;
    const provider = { bootstrap: vi.fn(async () => route({ expiresAt: clock + 60_000, renewAfter: clock + 48_000 })),
      renew: vi.fn(() => new Promise<DatafnRegionalRouteDescriptor>(() => {})) };
    const cache = new DatafnRegionalRouteCache(provider, () => clock);
    await cache.get();
    clock += 48_000;
    await cache.get();
    expect(provider.renew).toHaveBeenCalledTimes(1);
    clock += 12_001;
    const pending = cache.get();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(provider.bootstrap).toHaveBeenCalledTimes(2);
    expect((await pending).expiresAt).toBe(clock + 60_000);
    cache.dispose();
  });

  it("allows a listener to dispose during invalidation without recursive notification", async () => {
    const cache = new DatafnRegionalRouteCache({ bootstrap: async () => route(), renew: async () => route() });
    await cache.get();
    const listener = vi.fn(() => cache.dispose());
    cache.subscribe(listener);
    cache.invalidate();
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(cache.get()).rejects.toMatchObject({ code: "DATAFN_ROUTE_DISPOSED" });
  });

  it("accepts maximum TTL within bounded clock skew while preserving strict expiry", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    for (const ahead of [1, 5000, 5001]) {
      const cache = new DatafnRegionalRouteCache({ bootstrap: async () => route({ expiresAt: now + 300_000 + ahead }), renew: async () => route() });
      if (ahead <= 5000) expect((await cache.get()).expiresAt).toBe(now + 300_000 + ahead);
      else await expect(cache.get()).rejects.toMatchObject({ code: "DATAFN_ROUTE_DESCRIPTOR_INVALID" });
      cache.dispose();
    }
  });

  it("never restores a descriptor from an invalidated in-flight bootstrap", async () => {
    let release!: (value: DatafnRegionalRouteDescriptor) => void;
    const provider = { bootstrap: vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(route({ ticket: "fresh.ticket" })), renew: vi.fn() };
    const cache = new DatafnRegionalRouteCache(provider);
    const pending = cache.get();
    await Promise.resolve();
    cache.invalidate();
    release(route({ ticket: "stale.ticket" }));
    expect((await pending).ticket).toBe("fresh.ticket");
    cache.dispose();
  });

  it.each([
    { httpUrl: "https://user:password@eu.example/datafn" }, { httpUrl: "http://eu.example/datafn" },
    { wsUrl: "wss://eu.example/ws?ticket=secret" }, { expiresAt: 0 }, { renewAfter: 0 },
    { httpUrl: "https://eu.example/datafn?" }, { httpUrl: "https://eu.example/datafn#" },
    { wsUrl: "wss://eu.example/ws?" }, { wsUrl: "wss://eu.example/ws#" },
    { expiresAt: Date.now() + 600_000 }, { ticket: "bad token" },
  ])("rejects invalid descriptor %j", async patch => {
    const cache = new DatafnRegionalRouteCache({ bootstrap: async () => route(patch), renew: async () => route() });
    await expect(cache.get()).rejects.toMatchObject({ code: "DATAFN_ROUTE_DESCRIPTOR_INVALID" });
    cache.dispose();
  });

  it("shares one ticket across HTTP operations without forwarding cookies or following redirects", async () => {
    const provider = { bootstrap: vi.fn(async () => route()), renew: vi.fn(async () => route()) };
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    const transport = new DefaultHttpTransport("https://canonical.example/datafn", { routeProvider: provider, fetch,
      headers: { authorization: "Bearer application-token", "x-datafn-routing-region": "forged" } });
    for (const op of ["query", "mutation", "transact", "pull", "push", "reconcile", "clone", "seed", "search"] as const) await transport[op]({ id: "stable" });
    expect(provider.bootstrap).toHaveBeenCalledTimes(1);
    for (const call of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[0]).toMatch(/^https:\/\/eu.example\/datafn\//);
      expect(call[1]).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
      const headers = new Headers(call[1].headers);
      expect(headers.get("x-datafn-route-ticket")).toBe("header.payload.signature");
      expect(headers.get("authorization")).toBe("Bearer application-token");
      expect(headers.has("x-datafn-routing-region")).toBe(false);
    }
    transport.dispose();
  });

  it("re-bootstraps on proven pre-execution mismatch and preserves the exact mutation body", async () => {
    const provider = { bootstrap: vi.fn().mockResolvedValueOnce(route()).mockResolvedValue(route({ httpUrl: "https://us.example/datafn" })), renew: vi.fn() };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: false, error: { code: "DATAFN_REGION_MISMATCH", details: { executionStarted: false } } }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const transport = new DefaultHttpTransport("", { routeProvider: provider, fetch });
    await transport.mutation({ mutationId: "unchanged", data: { title: "one" } });
    expect(provider.bootstrap).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["https://eu.example/datafn/mutation", "https://us.example/datafn/mutation"]);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    transport.dispose();
  });

  it("never replays ambiguous mutations, even when the caller supplies a mutation ID", async () => {
    const provider = { bootstrap: async () => route(), renew: async () => route() };
    for (const failure of [
      () => Promise.reject(new Error("connection lost after commit")),
      () => Promise.resolve(Response.json({ error: { code: "DATAFN_REGION_MISMATCH", details: { executionStarted: true } } }, { status: 409 })),
    ]) {
      const fetch = vi.fn(failure);
      const transport = new DefaultHttpTransport("", { routeProvider: provider, fetch });
      await transport.mutation({ mutationId: "one" }).catch(() => {});
      expect(fetch).toHaveBeenCalledTimes(1);
      transport.dispose();
    }
  });

  it("does not replay a regional mutation through generic auth retry without execution proof", async () => {
    const onUnauthorized = vi.fn(async () => "retry" as const);
    const fetch = vi.fn(async () => Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }));
    const transport = new DefaultHttpTransport("", { routeProvider: { bootstrap: async () => route(), renew: async () => route() }, fetch, auth: { onUnauthorized } });
    await transport.mutation({});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    transport.dispose();
  });

  it("does not treat terminal ticket rejection as an application auth refresh", async () => {
    const onUnauthorized = vi.fn(async () => "retry" as const);
    const fetch = vi.fn(async () => Response.json({ error: { code: "DATAFN_ROUTE_TICKET_REVOKED" } }, { status: 401 }));
    const transport = new DefaultHttpTransport("", { routeProvider: { bootstrap: async () => route(), renew: async () => route() }, fetch, auth: { onUnauthorized } });
    await transport.mutation({});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    transport.dispose();
  });

  it("uses a canonical POST provider with no cached routing input", async () => {
    const fetch = vi.fn(async () => Response.json(route()));
    const provider = createDatafnHttpRouteProvider({ bootstrapUrl: "https://app.example/bootstrap", fetch });
    await provider.bootstrap(); await provider.renew();
    for (const args of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(args).toMatchObject(["https://app.example/bootstrap", { method: "POST", cache: "no-store", redirect: "error" }]);
      expect(args[1].body).toBeUndefined();
    }
  });
});
