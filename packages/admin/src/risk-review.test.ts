import { describe, expect, it } from "vitest";
import { reviewAdminMutationRisks } from "./risk-review.js";
import { testManifest } from "./test-fixtures.js";

describe("administration mutation risk review", () => {
  it("emits deterministic machine-readable results and fails weak credential confirmation", () => {
    const base = testManifest("examplefn").operations[0]!;
    const manifest = testManifest("examplefn", { operations: [
      {
        ...base,
        id: "examplefn.credentials.rotate",
        safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "Rotate." }, audit: "required" },
      },
      {
        ...base,
        id: "examplefn.messages.send-email",
        safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "Send." }, audit: "required" },
      },
    ] });
    expect(reviewAdminMutationRisks([manifest])).toEqual([
      expect.objectContaining({ operationId: "examplefn.credentials.rotate", categories: ["credential-lifecycle"], status: "fail" }),
      expect.objectContaining({ operationId: "examplefn.messages.send-email", categories: ["external-side-effect"], status: "pass" }),
    ]);
    expect(() => JSON.stringify(reviewAdminMutationRisks([manifest]))).not.toThrow();
  });
});
