import { describe, expect, it, vi } from "vitest";
import { DefaultOAuthTokenHttpClient, type OAuthFetchLike, type RequestInitLike } from "@superfunctions/oauth-http";
import {
  authOAuthProviderIds,
  createDefaultProviderPolicyRegistry,
  getOAuthProviderDescriptor,
  getProviderPolicy,
  listAuthOAuthProviderDescriptors,
  listAuthProviderPolicies
} from "../src/index.js";

describe("oauth-providers auth runtime coverage", () => {
  it("publishes deterministic auth provider descriptors for Google, Apple, and GitHub", () => {
    expect(authOAuthProviderIds).toEqual(["google", "apple", "github"]);
    expect(listAuthOAuthProviderDescriptors().map((provider) => provider.id)).toEqual(["google", "apple", "github"]);
    expect(listAuthProviderPolicies().map((policy) => policy.providerId)).toEqual(["google", "apple", "github"]);

    expect(getOAuthProviderDescriptor("google")).toMatchObject({
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revocationUrl: "https://oauth2.googleapis.com/revoke",
      defaultScopes: ["openid", "email", "profile"],
      tokenAuthMethod: "client_secret_post"
    });

    expect(getOAuthProviderDescriptor("apple")).toMatchObject({
      authorizationUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      revocationUrl: "https://appleid.apple.com/auth/revoke",
      defaultScopes: ["name", "email"],
      responseType: "code",
      tokenAuthMethod: "client_secret_post"
    });

    expect(getOAuthProviderDescriptor("github")).toMatchObject({
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      revocationUrl: "https://api.github.com/applications/{client_id}/token",
      defaultScopes: ["read:user", "user:email"],
      tokenAuthMethod: "client_secret_post"
    });
  });

  it("covers auth-oriented scope and operation policies deterministically", async () => {
    const registry = createDefaultProviderPolicyRegistry(() => "2026-03-21T00:00:00.000Z");

    const googleAuth = await registry.validateScopes({
      providerId: "google",
      feature: "auth.social.profile",
      requestedScopes: ["openid", "email", "profile"],
      tenantId: "tenant_1",
      userId: "user_1",
      purpose: "auth.signin"
    });

    expect(googleAuth.authorized).toBe(true);
    expect(googleAuth.consentRecord.policyVersion).toBe("2026-03-11");

    const applePolicy = registry.getPolicy("apple");
    expect(applePolicy.auth).toEqual({
      supportsSocialLogin: true,
      supportsAccountLinking: true,
      defaultScopes: ["name", "email"],
      availableClaims: ["email", "name"]
    });

    expect(
      registry.assertOperationAllowed({
        providerId: "github",
        operation: "auth.signin",
        featureMode: "metadata-only"
      })
    ).toEqual({
      allowed: true,
      policyVersion: "2026-03-11"
    });

    expect(
      registry.assertOperationAllowed({
        providerId: "apple",
        operation: "auth.account.link",
        featureMode: "metadata-only"
      })
    ).toEqual({
      allowed: true,
      policyVersion: "2026-03-11"
    });
  });

  it("represents Apple runtime behavior through resolver-required policy and oauth-http secret resolution", async () => {
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (_url, init) => {
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "at_apple_runtime",
          refresh_token: "rt_apple_runtime",
          token_type: "bearer"
        })
      });
    };

    const applePolicy = getProviderPolicy("apple");
    expect(applePolicy.runtime).toEqual({
      clientSecretMode: "resolver-required",
      clientSecretResolverHint: "apple-client-secret-jwt"
    });

    const resolver = vi.fn(async () => ({
      clientSecret: "generated-apple-jwt-client-secret"
    }));

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    const response = await client.exchangeToken({
      provider: getOAuthProviderDescriptor("apple"),
      grantType: "authorization_code",
      clientId: "apple-client-id",
      clientSecretResolver: resolver,
      code: "apple-code",
      redirectUri: "https://app.example/callback"
    });

    expect(response.accessToken).toBe("at_apple_runtime");
    expect(resolver).toHaveBeenCalledTimes(1);

    const params = new URLSearchParams(capturedInit?.body);
    expect(params.get("client_secret")).toBe("generated-apple-jwt-client-secret");

    await expect(
      client.exchangeToken({
        provider: getOAuthProviderDescriptor("apple"),
        grantType: "authorization_code",
        clientId: "apple-client-id",
        clientSecretResolver: async () => {
          throw new Error("apple signing key unavailable");
        },
        code: "apple-code-failure",
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_SECRET_RESOLUTION_FAILED",
      details: {
        providerId: "apple",
        operation: "exchange"
      }
    });
  });
});

function createResponse(input: {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}) {
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    headers: {
      get(name: string) {
        const entry = Object.entries({
          "content-type": input.contentType,
          ...input.headers
        }).find(([key]) => key.toLowerCase() === name.toLowerCase());
        return entry?.[1] ?? null;
      }
    },
    async text() {
      return input.body;
    }
  };
}
