import { describe, expect, it } from "vitest";

import { createDatafnPublicLinksApi } from "../src/public-links.js";

describe("DataFn public links client", () => {
  it("preserves recognized server error codes", async () => {
    const api = createDatafnPublicLinksApi({
      publicLinks: async () => ({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Public-link creation is not allowed",
          details: { path: "level" },
        },
      }),
    } as unknown as Parameters<typeof createDatafnPublicLinksApi>[0]);

    await expect(api.create({
      resource: "document",
      scope: "resource",
      level: "viewer",
    })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Public-link creation is not allowed",
      details: { path: "level" },
    });
  });

  it("falls back to a validation error for unknown server codes", async () => {
    const api = createDatafnPublicLinksApi({
      publicLinks: async () => ({
        ok: false,
        error: { code: "UNRECOGNIZED", message: "Unknown failure" },
      }),
    } as unknown as Parameters<typeof createDatafnPublicLinksApi>[0]);

    await expect(api.resolve({ token: "public-token" })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Unknown failure",
    });
  });
});
