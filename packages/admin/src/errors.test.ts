import { describe, expect, it } from "vitest";

import { normalizeAdminError } from "./errors.js";

describe("normalizeAdminError", () => {
  it("preserves AdminError instances created by another package copy", () => {
    class ForeignAdminError extends Error {
      readonly name = "AdminError";
      readonly code = "forbidden";
      readonly status = 403;
      readonly details = { permission: "records.write" };
      readonly retryable = false;
    }

    expect(normalizeAdminError(new ForeignAdminError("Denied"), { requestId: "req_1" })).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "Denied",
        status: 403,
        details: { permission: "records.write" },
        retryable: false,
      },
      requestId: "req_1",
    });
  });

  it("does not trust plain objects that mimic an AdminError", () => {
    expect(normalizeAdminError({
      name: "AdminError",
      message: "Forged",
      code: "forbidden",
      status: 403,
      retryable: false,
    })).toMatchObject({
      ok: false,
      error: { code: "internal", status: 500 },
    });
  });
});
