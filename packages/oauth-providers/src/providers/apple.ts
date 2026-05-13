import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import type { ProviderPolicyDefinition } from "../policy-registry.js";

export const appleOAuthProviderDescriptor: OAuthProviderDescriptor = {
  id: "apple",
  authorizationUrl: "https://appleid.apple.com/auth/authorize",
  tokenUrl: "https://appleid.apple.com/auth/token",
  revocationUrl: "https://appleid.apple.com/auth/revoke",
  defaultScopes: ["name", "email"],
  responseType: "code",
  supportsPkce: false,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  extraAuthParams: {
    response_mode: "form_post"
  },
  tokenAuthMethod: "client_secret_post"
};

export const appleProviderPolicy: ProviderPolicyDefinition = {
  providerId: "apple",
  policyVersion: "2026-03-11",
  descriptor: appleOAuthProviderDescriptor,
  capabilities: {
    supportsMailRead: false,
    supportsMailSend: false,
    supportsWatch: false,
    supportsRevoke: true,
    supportsManagedMailbox: false,
    allowedFeatureModes: ["metadata-only"]
  },
  auth: {
    supportsSocialLogin: true,
    supportsAccountLinking: true,
    defaultScopes: ["name", "email"],
    availableClaims: ["email", "name"]
  },
  runtime: {
    clientSecretMode: "resolver-required",
    clientSecretResolverHint: "apple-client-secret-jwt"
  },
  featureScopes: {
    "auth.social.profile": {
      allowedScopes: ["name", "email"]
    },
    "profile.basic": {
      allowedScopes: ["name", "email"]
    }
  },
  operationPolicies: {
    "auth.account.link": {
      allowed: true
    },
    "auth.signin": {
      allowed: true
    },
    "mail.watch.create": {
      allowed: false,
      reason: "Apple OAuth descriptor is social-only in shared registry"
    },
    "mail.read.metadata": {
      allowed: false,
      reason: "Apple OAuth descriptor is social-only in shared registry"
    },
    "mail.read.fullbody": {
      allowed: false,
      reason: "Apple OAuth descriptor is social-only in shared registry"
    },
    "mail.send": {
      allowed: false,
      reason: "Apple OAuth descriptor is social-only in shared registry"
    },
    "oauth.revoke": {
      allowed: true
    }
  }
};
