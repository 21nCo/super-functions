import { describe, expect, it } from "vitest";
import { OAuthHttpError } from "../index.js";

describe("oauth-http exports", () => {
  it("exports OAuthHttpError", () => {
    const error = new OAuthHttpError("failed", { code: "OAUTH_TOKEN_EXCHANGE_FAILED", status: 400 });
    expect(error.code).toBe("OAUTH_TOKEN_EXCHANGE_FAILED");
    expect(error.status).toBe(400);
  });
});
