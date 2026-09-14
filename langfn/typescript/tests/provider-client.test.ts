import { describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import {
  AbortError,
  ProviderAuthError,
  RateLimitError,
  TimeoutError,
  UnsupportedProviderError,
  ValidationError
} from "../src/core/errors.js";
import { CancellationToken } from "../src/utils/cancel.js";
import { getTransportClient } from "../src/models/transport.js";

describe("provider and client contract", () => {
  it("constructs the required first-party providers plus custom SPI", async () => {
    const lang = new LangFn();
    const providers = ["openai", "anthropic", "ollama", "google", "mistral"] as const;

    for (const provider of providers) {
      const instance = lang.withModel(provider, { model: "test-model" });
      await expect(instance.getTraces()).resolves.toEqual([]);
    }

    const custom = lang.withModel("custom", {
      complete: async (request) => ({ content: `custom:${request.prompt}` })
    });
    await expect(custom.complete("ping")).resolves.toMatchObject({ content: "custom:ping" });
  });

  it("rejects unsupported providers and invalid inputs with canonical errors", async () => {
    expect(() => new LangFn().withModel("bogus" as never)).toThrowError(UnsupportedProviderError);

    const client = new LangFn().withModel("mock", {});
    await expect(client.chat([])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(client.feedback({ rating: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("parses provider responses and normalizes provider failures", async () => {
    const successFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: '{"sentiment":"positive","confidence":0.9}',
                tool_calls: [
                  {
                    id: "call_1",
                    function: { name: "add", arguments: "{\"a\":2,\"b\":3}" }
                  }
                ]
              }
            }
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const client = new LangFn().withModel("openai", { apiKey: "fixture",
      model: "gpt-4o-mini",
      fetchImpl: successFetch
    });
    const response = await client.chat(
      [{ role: "user", content: "return json" }],
      {
        structured: {
          parse(text: string) {
            return JSON.parse(text) as { sentiment: string; confidence: number };
          }
        }
      }
    );

    expect(response.traceId).toBeTruthy();
    expect(response.toolCalls?.[0]).toMatchObject({ name: "add", arguments: { a: 2, b: 3 } });
    expect(response.parsed).toEqual({ sentiment: "positive", confidence: 0.9 });

    const authFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
    const authClient = new LangFn().withModel("openai", { apiKey: "fixture", fetchImpl: authFetch });
    await expect(authClient.complete("x")).rejects.toBeInstanceOf(ProviderAuthError);

    let rateLimitAttempts = 0;
    const rateLimitFetch: typeof fetch = async () => {
      rateLimitAttempts += 1;
      if (rateLimitAttempts === 1) {
        return new Response(JSON.stringify({ error: { message: "slow down" } }), {
          status: 429,
          headers: { "retry-after": "0" }
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        }),
        { status: 200 }
      );
    };
    const retryClient = new LangFn().withModel("openai", { apiKey: "fixture", fetchImpl: rateLimitFetch });
    await expect(
      retryClient.complete("retry me", { retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 } })
    ).resolves.toMatchObject({ content: "ok" });
    expect(rateLimitAttempts).toBe(2);
  });

  it("supports timeout, cancellation, and ordered partial batch results", async () => {
    const attempts = new Map<string, number>();
    const client = new LangFn().withModel("custom", {
      complete: async (request) => {
        const current = attempts.get(request.prompt) ?? 0;
        attempts.set(request.prompt, current + 1);
        if (request.prompt === "a" && current === 0) {
          throw new RateLimitError(undefined, { retryAfter: 0 });
        }
        if (request.prompt === "b") {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return { content: "b" };
        }
        return { content: request.prompt };
      }
    });

    const batch = await client.completeBatch(["a", "b", "c"], {
      timeout: 5,
      partialResults: true,
      retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 }
    });

    expect(batch.map((result) => result.index)).toEqual([0, 1, 2]);
    expect(batch[0]).toMatchObject({ ok: true, content: "a" });
    expect(batch[1]).toMatchObject({ ok: false, error: { code: "PROVIDER_TIMEOUT" } });
    expect(batch[2]).toMatchObject({ ok: true, content: "c" });

    await expect(
      client.completeBatch(["b"], { timeout: 5, partialResults: false })
    ).rejects.toBeInstanceOf(TimeoutError);

    const cancelToken = new CancellationToken();
    cancelToken.cancel();
    await expect(client.complete("cancelled", { cancelToken })).rejects.toBeInstanceOf(AbortError);
  });

  it("reuses shared transport clients for identical configs", () => {
    const fetchImpl: typeof fetch = async () => new Response("ok", { status: 200 });
    const first = getTransportClient({ baseUrl: "https://example.com", fetchImpl });
    const second = getTransportClient({ baseUrl: "https://example.com", fetchImpl });
    expect(first).toBe(second);
  });
});
