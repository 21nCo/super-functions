import { describe, expect, it, vi } from "vitest";
import { createSecFnRuntime, formatDotEnv } from "./index.js";

describe("secfn runtime", () => {
  it("fetches and caches secrets", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, data: { key: "API_KEY", value: "one", version: 1 } }),
    );
    const runtime = createSecFnRuntime({
      endpoint: "https://secfn.example/secfn",
      apiKey: "token",
      fetch: fetchMock as unknown as typeof fetch,
      cache: { ttlMs: 1000 },
    });

    await expect(runtime.get("API_KEY")).resolves.toBe("one");
    await expect(runtime.get("API_KEY")).resolves.toBe("one");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends tenant and namespace runtime scope headers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, data: { key: "API_KEY", value: "one", version: 1 } }),
    );
    const runtime = createSecFnRuntime({
      endpoint: "https://secfn.example/secfn",
      apiKey: "token",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await runtime.get("API_KEY");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "x-secfn-tenant": "tenant-a",
      "x-tenant-id": "tenant-a",
      "x-secfn-namespace": "workspace-a",
      "x-namespace": "workspace-a",
    });
  });

  it("formats dotenv without writing files", () => {
    expect(formatDotEnv({ API_KEY: "abc123", COMPLEX: "hello world" })).toBe(
      'API_KEY=abc123\nCOMPLEX="hello world"',
    );
  });

  it("resolves secret sets and injects env without overwriting by default", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, data: { name: "prod", secrets: { API_KEY: "remote", EXISTING: "remote" } } }),
    );
    const runtime = createSecFnRuntime({
      endpoint: "https://secfn.example/secfn",
      apiKey: "token",
      fetch: fetchMock as unknown as typeof fetch,
    });

    process.env.EXISTING = "local";
    await expect(runtime.getSet("prod")).resolves.toEqual({ API_KEY: "remote", EXISTING: "remote" });
    await runtime.injectEnv("prod");

    expect(process.env.API_KEY).toBe("remote");
    expect(process.env.EXISTING).toBe("local");
    delete process.env.API_KEY;
    delete process.env.EXISTING;
  });

  it("surfaces failed runtime fetches", async () => {
    const runtime = createSecFnRuntime({
      endpoint: "https://secfn.example/secfn",
      apiKey: "token",
      fetch: vi.fn(async () => Response.json({
        ok: false,
        error: { code: "SECFN_FORBIDDEN", message: "denied" },
      }, { status: 403 })) as unknown as typeof fetch,
    });

    await expect(runtime.get("API_KEY")).rejects.toThrow("denied");
  });
});

it("uses the configured set environment and separates cache entries", async () => {
  const fetchMock = vi.fn(async (_url: string) => Response.json({ ok: true, data: { secrets: {} } }));
  const runtime = createSecFnRuntime({ endpoint: "https://example.test", apiKey: "token", environment: "production", cache: { ttlMs: 1000 }, fetch: fetchMock as typeof fetch });
  await runtime.getSet("app"); await runtime.getSet("app", { environment: "development" }); await runtime.getSet("app");
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    "https://example.test/runtime/secret-sets/app/resolve?environment=production",
    "https://example.test/runtime/secret-sets/app/resolve?environment=development"
  ]);
});
