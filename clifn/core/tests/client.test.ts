import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiClient, HttpFailureError, HttpRequestError } from "../src/client.js";
import { createCredentialStore, MissingProfileError } from "../src/credentials.js";

describe("client", () => {
  it("uses credential profile and sends auth headers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-client-"));
    const store = createCredentialStore(join(dir, "credentials.ini"));
    store.setProfile("default", {
      backend: "https://api.conduct.sh",
      key: "sk_live_abc",
    });

    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const auth = headers.get("Authorization");
      expect(String(input)).toContain("/health");
      expect(auth).toBe("Bearer sk_live_abc");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createApiClient({
      credentials: store,
      profile: "default",
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const response = await client.get<{ ok: boolean }>("/health");
    expect(response.data).toEqual({ ok: true });
  });

  it("rejects absolute request URLs so auth headers stay scoped to the configured backend", async () => {
    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(client.get("https://evil.example/steal")).rejects.toMatchObject({
      code: "CLIFN_HTTP_REQUEST_ERROR",
      message: "HTTP request error for https://api.conduct.sh: request path must be relative",
    });
  });

  it("throws typed error for missing profile", () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-client-missing-"));
    const store = createCredentialStore(join(dir, "credentials.ini"));

    expect(() =>
      createApiClient({
        credentials: store,
        profile: "missing",
      }),
    ).toThrow(MissingProfileError);
  });

  it("throws typed error for http failure", async () => {
    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });

    await expect(client.get("/fail")).rejects.toBeInstanceOf(HttpFailureError);
  });

  it("throws typed error for request failure", async () => {
    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    await expect(client.get("/network")).rejects.toBeInstanceOf(HttpRequestError);
  });

  it("preserves non-json request bodies instead of stringifying them", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBe("plain text payload");
      expect(new Headers(init?.headers).get("Content-Type")).toBeNull();

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await expect(client.post("/plain", "plain text payload")).resolves.toMatchObject({
      data: { ok: true },
    });
  });

  it("treats header names case-insensitively when deciding whether to add content-type", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("text/plain");

      return new Response("", {
        status: 200,
      });
    });

    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await expect(
      client.request({
        method: "POST",
        path: "/plain",
        body: "plain text payload",
        headers: {
          "CONTENT-TYPE": "text/plain",
        },
      })
    ).resolves.toMatchObject({
      data: null,
    });
  });

  it("does not retry one-shot readable stream bodies", async () => {
    let attempts = 0;
    const fetchSpy = vi.fn(async () => {
      attempts += 1;
      throw new Error("network down");
    });

    const client = createApiClient({
      baseUrl: "https://api.conduct.sh",
      apiKey: "sk_live_abc",
      retries: 2,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("payload"));
        controller.close();
      },
    });

    await expect(client.post("/stream", body)).rejects.toBeInstanceOf(HttpRequestError);
    expect(attempts).toBe(1);
  });

  it("wraps malformed base urls in a typed request error", async () => {
    const client = createApiClient({
      baseUrl: "not a url",
      apiKey: "sk_live_abc",
      retries: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(client.get("/health")).rejects.toBeInstanceOf(HttpRequestError);
  });
});
