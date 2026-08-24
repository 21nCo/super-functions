import { describe, expect, it } from "vitest";
import {
  SuperfunctionsStoresDurableObject,
  cloudflareDurableObjectAtomicKVStore,
  redisAtomicKVStore,
  type CloudflareDurableObjectNamespace,
  type DurableObjectStateLike,
  type RedisCommandClient,
} from "@superfunctions/db/adapters";
import type { ConditionalKVStoreAdapter } from "@superfunctions/db";

import {
  DatafnRoutingError,
  claimDatafnNamespacePlacement,
  createConditionalKvDatafnPlacementDirectory,
  createDatafnGatewayRouter,
  createDatafnHmacRoutingAssertions,
  createMemoryDatafnPlacementDirectory,
  migrateDatafnNamespace,
  validateDatafnPlacement,
  withDatafnRoutingAssertion,
  type DatafnNamespacePlacement,
} from "./multi-region-routing.js";

const fixedNow = Date.parse("2026-08-23T00:00:00.000Z");

describe("DataFn tenant placement", () => {
  it.each([
    ["Redis", createRedisTestStore],
    ["Cloudflare Durable Objects", createDurableObjectTestStore],
  ])("passes claim and fenced-move conformance with the %s provider adapter", async (_name, createStore) => {
    const directory = createConditionalKvDatafnPlacementDirectory(createStore());
    const first = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:provider",
      regionId: "eu",
    });
    expect(first.claimed).toBe(true);
    const moved = await directory.compareAndSet({
      namespace: first.placement.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: { ...first.placement, regionId: "us", epoch: 2 },
    });
    expect(moved).toMatchObject({ updated: true, placement: { regionId: "us", epoch: 2 } });
    await expect(directory.get("tenant:provider")).resolves.toMatchObject({
      regionId: "us",
      epoch: 2,
    });
  });

  it("claims initial ownership atomically and moves only through an epoch CAS", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const first = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "eu",
      now: () => fixedNow,
    });
    const concurrent = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "us",
      now: () => fixedNow,
    });

    expect(first).toMatchObject({ claimed: true, placement: { regionId: "eu", epoch: 1 } });
    expect(concurrent).toMatchObject({ claimed: false, placement: { regionId: "eu", epoch: 1 } });

    const stale = await directory.compareAndSet({
      namespace: "tenant:one",
      expectedEpoch: 0,
      expectedState: "active",
      next: { ...first.placement, epoch: 2, regionId: "us" },
    });
    expect(stale.updated).toBe(false);
    await expect(directory.get("tenant:one")).resolves.toMatchObject({ regionId: "eu", epoch: 1 });
  });

  it("runs the fenced migration protocol in order and preserves rollback evidence", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:move",
      regionId: "eu",
      now: () => fixedNow,
    });
    const order: string[] = [];
    const placement = await migrateDatafnNamespace({
      directory,
      namespace: "tenant:move",
      targetRegionId: "us",
      now: () => fixedNow + 1,
      hooks: {
        async quiesceSource() { order.push("quiesce"); },
        async drainPermissionDirectory() { order.push("drain-outbox"); },
        async copyTenantData() { order.push("copy"); },
        async validateTenantData() { order.push("validate"); },
        async rebuildPermissionDirectory() { order.push("reindex"); },
        async warmTarget() { order.push("warm"); },
        async resumeTarget() { order.push("resume"); },
      },
    });

    expect(order).toEqual([
      "quiesce",
      "drain-outbox",
      "copy",
      "validate",
      "reindex",
      "warm",
      "resume",
    ]);
    expect(placement).toMatchObject({
      regionId: "us",
      epoch: 3,
      state: "active",
      previousRegionId: "eu",
    });
  });
});

function createRedisTestStore(): ConditionalKVStoreAdapter {
  const values = new Map<string, string>();
  const client: RedisCommandClient = {
    async sendCommand(command) {
      switch (command[0]) {
        case "GET":
          return values.get(command[1]!) ?? null;
        case "SET": {
          const key = command[1]!;
          if (command.includes("NX") && values.has(key)) return null;
          values.set(key, command[2]!);
          return "OK";
        }
        case "EVAL": {
          const key = command[3]!;
          const current = values.get(key) ?? null;
          const expectingNull = command[4] === "1";
          const expected = expectingNull ? null : command[5]!;
          if (current !== expected) return [0, current];
          values.set(key, command[6]!);
          return [1, current];
        }
        case "DEL":
          return values.delete(command[1]!) ? 1 : 0;
        default:
          throw new Error(`unsupported test Redis command ${command[0]}`);
      }
    },
  };
  return redisAtomicKVStore(client);
}

function createDurableObjectTestStore(): ConditionalKVStoreAdapter {
  const values = new Map<string, unknown>();
  const state: DurableObjectStateLike = {
    storage: {
      async get<T>(key: string) { return values.get(key) as T | undefined; },
      async put<T>(key: string, value: T) { values.set(key, value); },
      async delete(key: string) { return values.delete(key); },
    },
  };
  const object = new SuperfunctionsStoresDurableObject(state);
  const namespace: CloudflareDurableObjectNamespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: (input, init) => object.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
    }),
  };
  return cloudflareDurableObjectAtomicKVStore(namespace);
}

describe("DataFn canonical gateway", () => {
  it("routes two namespaces through one URL without exposing cell destinations", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await Promise.all([
      claimDatafnNamespacePlacement({ directory, namespace: "tenant:eu", regionId: "eu" }),
      claimDatafnNamespacePlacement({ directory, namespace: "tenant:us", regionId: "us" }),
    ]);
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const executed: Array<{ region: string; namespace: string }> = [];
    const cells = new Map([
      ["eu", cell("eu")],
      ["us", cell("us")],
    ]);
    function cell(region: string) {
      return async (request: Request, namespace: string): Promise<Response> => {
        await validateDatafnPlacement({
          namespace,
          regionId: region,
          runtime: {
            directory,
            requireRoutingAssertion: true,
            assertionVerifier: assertions,
          },
          request,
        });
        executed.push({ region, namespace });
        return Response.json({ ok: true, result: { region } });
      };
    }
    const gateway = createDatafnGatewayRouter({
      directory,
      deriveNamespace: (request) => request.headers.get("x-authenticated-namespace") ?? "",
      cellRegistry: {
        resolve: ({ regionId }) => {
          const target = cells.get(regionId);
          if (!target) throw new Error("missing target");
          return target;
        },
      },
      dispatcher: {
        dispatch: ({ target, request, assertion, placement }) =>
          target(withDatafnRoutingAssertion(request, assertion), placement.namespace),
      },
      assertionSigner: assertions,
    });

    const eu = await gateway.handle(new Request("https://data.example/datafn/query", {
      method: "POST",
      headers: { "x-authenticated-namespace": "tenant:eu" },
      body: JSON.stringify({ resource: "note" }),
    }));
    const us = await gateway.handle(new Request("https://data.example/datafn/mutation", {
      method: "POST",
      headers: { "x-authenticated-namespace": "tenant:us" },
      body: JSON.stringify({ resource: "note", operation: "create" }),
    }));

    expect(eu.status).toBe(200);
    expect(us.status).toBe(200);
    expect(executed).toEqual([
      { region: "eu", namespace: "tenant:eu" },
      { region: "us", namespace: "tenant:us" },
    ]);
    expect(JSON.stringify(await us.json())).not.toContain("destination");
  });

  it("strips spoofed headers and retries a stale epoch once before any mutation effect", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    const claimed = await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:move",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    const effects = { eu: 0, us: 0 };
    const dispatches: string[] = [];
    const target = (regionId: "eu" | "us") => async (
      request: Request,
      namespace: string,
    ): Promise<Response> => {
      try {
        await validateDatafnPlacement({
          namespace,
          regionId,
          runtime: { directory, requireRoutingAssertion: true, assertionVerifier: assertions },
          request,
        });
      } catch (error) {
        if (error instanceof DatafnRoutingError) return error.toResponse();
        throw error;
      }
      effects[regionId]++;
      return Response.json({ ok: true });
    };
    const cells = { eu: target("eu"), us: target("us") };
    const gateway = createDatafnGatewayRouter({
      directory,
      cacheTtlMs: 60_000,
      deriveNamespace: () => "tenant:move",
      cellRegistry: { resolve: ({ regionId }) => cells[regionId as "eu" | "us"] },
      dispatcher: {
        dispatch: ({ target: selected, request, assertion, placement }) => {
          dispatches.push(placement.regionId);
          return selected(withDatafnRoutingAssertion(request, assertion), placement.namespace);
        },
      },
      assertionSigner: assertions,
    });

    // Prime the gateway cache without a visible effect.
    expect((await gateway.handle(new Request("https://data.example/datafn/query", {
      method: "POST",
      body: "{}",
    }))).status).toBe(200);
    effects.eu = 0;
    dispatches.length = 0;

    const moved: DatafnNamespacePlacement = {
      ...claimed.placement,
      regionId: "us",
      epoch: 2,
      previousRegionId: "eu",
      updatedAt: new Date().toISOString(),
    };
    expect((await directory.compareAndSet({
      namespace: moved.namespace,
      expectedEpoch: 1,
      expectedState: "active",
      next: moved,
    })).updated).toBe(true);

    const response = await gateway.handle(new Request("https://data.example/datafn/mutation", {
      method: "POST",
      headers: {
        "x-datafn-routing-assertion": "attacker-controlled",
        "x-datafn-routing-region": "attacker-region",
      },
      body: JSON.stringify({ operation: "create" }),
    }));

    expect(response.status).toBe(200);
    expect(dispatches).toEqual(["eu", "us"]);
    expect(effects).toEqual({ eu: 0, us: 1 });
  });

  it("fails closed when a directory is unavailable", async () => {
    const gateway = createDatafnGatewayRouter({
      directory: {
        async get() { throw new Error("offline"); },
        async putIfAbsent(placement) { return { inserted: false, placement }; },
        async compareAndSet({ next }) { return { updated: false, placement: next }; },
      },
      deriveNamespace: () => "tenant:one",
      cellRegistry: { resolve: () => ({}) },
      dispatcher: { dispatch: async () => Response.json({ ok: true }) },
      assertionSigner: { sign: () => "unused" },
    });

    const response = await gateway.handle(new Request("https://data.example/datafn/query"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DATAFN_PLACEMENT_UNAVAILABLE", details: { retryable: true } },
    });
  });
});

describe("DataFn cell fencing", () => {
  it("rejects spoofed assertions before execution", async () => {
    const directory = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory,
      namespace: "tenant:one",
      regionId: "eu",
    });
    const assertions = createDatafnHmacRoutingAssertions({
      activeKeyId: "v1",
      keys: { v1: "test-only-secret" },
    });
    await expect(validateDatafnPlacement({
      namespace: "tenant:one",
      regionId: "eu",
      runtime: { directory, requireRoutingAssertion: true, assertionVerifier: assertions },
      request: new Request("https://cell.internal/datafn/query", {
        headers: { "x-datafn-routing-assertion": "forged" },
      }),
    })).rejects.toMatchObject({
      code: "DATAFN_ROUTING_ASSERTION_INVALID",
      executionStarted: false,
    });
  });
});
