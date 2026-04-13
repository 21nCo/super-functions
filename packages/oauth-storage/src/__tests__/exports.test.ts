import { describe, expect, it } from "vitest";
import type { OAuthStateRecord, TokenRecord } from "../index.js";

describe("oauth-storage exports", () => {
  it("exposes state and token records", () => {
    const state: OAuthStateRecord = {
      stateId: "st_1",
      tenantId: "tenant_1",
      userId: "user_1",
      providerId: "google",
      redirectUri: "https://app.example/callback",
      requestedScopes: ["scope"],
      createdAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-01T00:10:00Z"
    };

    const token: TokenRecord = {
      tokenId: "tok_1",
      tenantId: "tenant_1",
      userId: "user_1",
      providerId: "google",
      connectionId: "conn_1",
      encryptedPayload: "cipher",
      keyRef: "kms_1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };

    expect(state.providerId).toBe("google");
    expect(token.connectionId).toBe("conn_1");
  });
});
