import { describe, expect, it } from "vitest";
import type { OAuthIntentSubject, OAuthProviderDescriptor, OAuthService } from "../index.js";

describe("oauth-core exports", () => {
  it("exposes compile-time contracts", () => {
    const descriptor: OAuthProviderDescriptor = {
      id: "example",
      authorizationUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      defaultScopes: ["read"],
      supportsPkce: true,
      supportsRefreshToken: true
    };

    expect(descriptor.id).toBe("example");
    const subject: OAuthIntentSubject = {
      kind: "browser-auth",
      intentId: "intent_01"
    };
    expect(subject.kind).toBe("browser-auth");
    expectType<OAuthService>();
  });
});

function expectType<T>(): void {
  void (0 as unknown as T);
}
