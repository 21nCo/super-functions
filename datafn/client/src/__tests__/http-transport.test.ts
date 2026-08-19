import { describe, expect, it, vi } from "vitest";
import { DefaultHttpTransport } from "../transport/http.js";

describe("DefaultHttpTransport", () => {
  it("posts JSON with configured credentials and dynamic headers", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { data: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const transport = new DefaultHttpTransport("https://example.com/datafn/", {
      fetch: fetchMock as typeof fetch,
      credentials: "include",
      headers: async () => ({
        authorization: "Bearer token",
        "x-datafn-public-link-token": "plink:1.secret",
      }),
    });

    await transport.query({ resource: "collection" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = options.headers as Headers;
    expect(url).toBe("https://example.com/datafn/query");
    expect(options.credentials).toBe("include");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("x-datafn-public-link-token")).toBe("plink:1.secret");
  });

  it("uses auth provider headers and retries once after unauthorized responses", async () => {
    let token = "old-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { data: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const transport = new DefaultHttpTransport("https://example.com/datafn", {
      fetch: fetchMock as typeof fetch,
      auth: {
        getRequestHeaders: () => ({ authorization: `Bearer ${token}` }),
        onUnauthorized: () => {
          token = "new-token";
          return "retry";
        },
      },
    });

    await transport.pull({ cursor: null });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    const secondHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(firstHeaders.get("authorization")).toBe("Bearer old-token");
    expect(secondHeaders.get("authorization")).toBe("Bearer new-token");
  });

  it("serializes undefined payloads as valid JSON request bodies", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const transport = new DefaultHttpTransport("https://example.com/datafn", {
      fetch: fetchMock as typeof fetch,
    });

    await transport.pull(undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(options.body).toBe("null");
  });

  it("emits an error event for final non-ok responses", async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const transport = new DefaultHttpTransport("https://example.com/datafn", {
      fetch: fetchMock as typeof fetch,
      onError,
    });

    const result = await transport.push({ mutations: [] });

    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
    expect(onError).toHaveBeenCalledWith({
      endpoint: "push",
      url: "https://example.com/datafn/push",
      status: 403,
      result: { ok: false, error: { code: "FORBIDDEN" } },
    });
  });

  it("posts public-link operations through the DataFn HTTP namespace", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { id: "plink:1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const transport = new DefaultHttpTransport("https://example.com/datafn", {
      fetch: fetchMock as typeof fetch,
    });

    const result = await transport.publicLinks("public-links", {
      resource: "collection",
    });

    expect(result).toEqual({ ok: true, result: { id: "plink:1" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.com/datafn/public-links");
  });
});
