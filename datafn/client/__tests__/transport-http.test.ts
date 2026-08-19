import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefaultHttpTransport } from "../src/transport/http.js";

describe("DefaultHttpTransport", () => {
  const baseUrl = "https://api.example.com";
  const originalFetch = global.fetch;
  let transport: DefaultHttpTransport;

  beforeEach(() => {
    global.fetch = vi.fn();
    transport = new DefaultHttpTransport(baseUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch === undefined) {
      delete (globalThis as { fetch?: typeof global.fetch }).fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  it("constructs with base URL", () => {
    expect(transport).toBeDefined();
  });

  it("makes correct query request", async () => {
    const mockResponse = { ok: true, result: [] };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const query = { select: ["id"], resource: "task" };
    const result = await transport.query(query);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(query),
      }),
    );
    const options = (global.fetch as any).mock.calls[0][1] as RequestInit;
    expect((options.headers as Headers).get("content-type")).toBe(
      "application/json",
    );
    expect(result).toEqual(mockResponse);
  });

  it("makes correct mutation request", async () => {
    const mockResponse = { ok: true, result: { mutationId: "m1" } };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const mutation = { operation: "insert", resource: "task" };
    const result = await transport.mutation(mutation);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/mutation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(mutation),
      }),
    );
    const options = (global.fetch as any).mock.calls[0][1] as RequestInit;
    expect((options.headers as Headers).get("content-type")).toBe(
      "application/json",
    );
    expect(result).toEqual(mockResponse);
  });

  it("handles fetch errors", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network Error"));

    await expect(transport.query({})).rejects.toThrow("Network Error");
  });

  it("handles non-ok responses", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({ error: "Internal Error" }),
    });

    await expect(transport.query({})).resolves.toEqual({
      error: "Internal Error",
    });
  });

  it("throws on unparsable error response", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    await expect(transport.query({})).rejects.toThrow(
      "HTTP Error 502: Bad Gateway",
    );
  });
});
