import { describe, expect, it, vi } from "vitest";
import { createOAuthTokenDiagnosticFetcher } from "./oauth-support.js";

describe("OAuth token diagnostics", () => {
  it("does not let logger, event, or sink failures break token exchange", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ access_token: "secret", token_type: "bearer" }),
    }));
    const diagnosticFetcher = createOAuthTokenDiagnosticFetcher({
      fetcher,
      observability: {
        logger: {
          info: () => {
            throw new Error("logger unavailable");
          },
        },
        events: {
          emit: async () => {
            throw new Error("event sink unavailable");
          },
        },
      } as never,
      diagnostics: {
        includeSuccessful: true,
        sink: async () => {
          throw new Error("diagnostic sink unavailable");
        },
      },
    });

    const response = await diagnosticFetcher("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=secret-code",
    });

    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("access_token");
  });
});
