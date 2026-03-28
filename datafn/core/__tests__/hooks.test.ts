/**
 * Plugin hook runner tests
 * Tests TV-HKS-001, TV-HKS-002 from TEST_VECTORS.md
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { runBeforeHook, runAfterHook } from "../src/hooks.js";
import type { DatafnPlugin, DatafnHookContext } from "../src/types.js";

const ctx: DatafnHookContext = { env: "server", schema: {} as any };
const clientCtx: DatafnHookContext = { env: "client", schema: {} as any };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runBeforeHook (TV-HKS-001)", () => {
  it("returns ok with final payload when all hooks succeed", async () => {
    const plugins: DatafnPlugin[] = [
      { name: "p1", runsOn: ["server"], beforeQuery: async (c, q: any) => ({ ...q, p1: true }) },
      { name: "p2", runsOn: ["server"], beforeQuery: async (c, q: any) => ({ ...q, p2: true }) },
    ];
    const result = await runBeforeHook(plugins, "server", "beforeQuery", ctx, { id: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 1, p1: true, p2: true });
    }
  });

  it("threads payload through chain", async () => {
    const callOrder: string[] = [];
    const plugins: DatafnPlugin[] = [
      { name: "p1", runsOn: ["server"], beforeQuery: async (c, q: any) => { callOrder.push("p1"); return { ...q, step: 1 }; } },
      { name: "p2", runsOn: ["server"], beforeQuery: async (c, q: any) => { callOrder.push("p2"); return { ...q, step: 2 }; } },
    ];
    const result = await runBeforeHook(plugins, "server", "beforeQuery", ctx, {});
    expect(callOrder).toEqual(["p1", "p2"]);
    if (result.ok) expect((result.value as any).step).toBe(2);
  });

  it("fail-closed: error stops chain, returns { ok: false, error } (TV-HKS-001)", async () => {
    const callOrder: string[] = [];
    const plugins: DatafnPlugin[] = [
      { name: "p1", runsOn: ["server"], beforeQuery: async (c, q) => { callOrder.push("p1"); return q; } },
      { name: "p2", runsOn: ["server"], beforeQuery: async () => { callOrder.push("p2"); throw new Error("fail"); } },
      { name: "p3", runsOn: ["server"], beforeQuery: async (c, q) => { callOrder.push("p3"); return q; } },
    ];
    const result = await runBeforeHook(plugins, "server", "beforeQuery", ctx, "query");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
    }
    expect(callOrder).toEqual(["p1", "p2"]);
  });

  it("env filtering: server plugins not called for client env", async () => {
    const called: string[] = [];
    const plugins: DatafnPlugin[] = [
      { name: "serverPlugin", runsOn: ["server"], beforeQuery: async (c, q) => { called.push("server"); return q; } },
      { name: "clientPlugin", runsOn: ["client"], beforeQuery: async (c, q) => { called.push("client"); return q; } },
    ];
    await runBeforeHook(plugins, "client", "beforeQuery", clientCtx, {});
    expect(called).toEqual(["client"]);
  });

  it("plugins without the hook method are skipped", async () => {
    const plugins: DatafnPlugin[] = [
      { name: "noHook", runsOn: ["server"] }, // no beforeQuery
    ];
    const result = await runBeforeHook(plugins, "server", "beforeQuery", ctx, "original");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("original");
  });

  it("empty plugins array returns ok with original payload", async () => {
    const result = await runBeforeHook([], "server", "beforeQuery", ctx, "payload");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("payload");
  });

  it("hook returning undefined preserves current payload", async () => {
    const plugins: DatafnPlugin[] = [
      { name: "p1", runsOn: ["server"], beforeQuery: async () => undefined as any },
    ];
    const result = await runBeforeHook(plugins, "server", "beforeQuery", ctx, "original");
    if (result.ok) expect(result.value).toBe("original");
  });
});

describe("runAfterHook (TV-HKS-002)", () => {
  it("calls all plugins even if one throws (fail-open)", async () => {
    const callOrder: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plugins: DatafnPlugin[] = [
      { name: "p1", runsOn: ["client"], afterQuery: async () => { callOrder.push("p1"); } },
      { name: "p2", runsOn: ["client"], afterQuery: async () => { callOrder.push("p2"); throw new Error("fail"); } },
      { name: "p3", runsOn: ["client"], afterQuery: async () => { callOrder.push("p3"); } },
    ];
    await runAfterHook(plugins, "client", "afterQuery", clientCtx, {}, {});
    expect(callOrder).toEqual(["p1", "p2", "p3"]);
  });

  it("error is logged on console.error (fail-open)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const plugins: DatafnPlugin[] = [
      { name: "errPlugin", runsOn: ["server"], afterQuery: async () => { throw new Error("oops"); } },
    ];
    await runAfterHook(plugins, "server", "afterQuery", ctx, {}, {});
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("env filtering works for after hooks", async () => {
    const called: string[] = [];
    const plugins: DatafnPlugin[] = [
      { name: "serverPlugin", runsOn: ["server"], afterQuery: async () => { called.push("server"); } },
      { name: "clientPlugin", runsOn: ["client"], afterQuery: async () => { called.push("client"); } },
    ];
    await runAfterHook(plugins, "server", "afterQuery", ctx, {}, {});
    expect(called).toEqual(["server"]);
  });

  it("plugins without the hook method are skipped", async () => {
    const plugins: DatafnPlugin[] = [
      { name: "noHook", runsOn: ["server"] },
    ];
    await expect(runAfterHook(plugins, "server", "afterQuery", ctx, {}, {})).resolves.toEqual({});
  });

  it("threads transformed results through after hooks", async () => {
    const plugins: DatafnPlugin[] = [
      {
        name: "p1",
        runsOn: ["server"],
        afterQuery: async (_ctx, _payload, result: any) => ({ ...result, step: 1 }),
      },
      {
        name: "p2",
        runsOn: ["server"],
        afterQuery: async (_ctx, _payload, result: any) => ({ ...result, step: result.step + 1 }),
      },
    ];

    await expect(
      runAfterHook(plugins, "server", "afterQuery", ctx, {}, { ok: true }),
    ).resolves.toEqual({ ok: true, step: 2 });
  });
});
