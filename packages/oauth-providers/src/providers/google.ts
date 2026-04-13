import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import type { ProviderPolicyDefinition } from "../policy-registry.js";

export const googleOAuthProviderDescriptor: OAuthProviderDescriptor = {
  id: "google",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revocationUrl: "https://oauth2.googleapis.com/revoke",
  defaultScopes: ["openid", "email", "profile"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

export const googleProviderPolicy: ProviderPolicyDefinition = {
  providerId: "google",
  policyVersion: "2026-03-11",
  descriptor: googleOAuthProviderDescriptor,
  capabilities: {
    supportsMailRead: true,
    supportsMailSend: true,
    supportsWatch: true,
    supportsRevoke: true,
    supportsManagedMailbox: true,
    allowedFeatureModes: ["metadata-only", "snippet", "full-body"]
  },
  auth: {
    supportsSocialLogin: true,
    supportsAccountLinking: true,
    defaultScopes: ["openid", "email", "profile"],
    availableClaims: ["email", "name", "profile"]
  },
  runtime: {
    clientSecretMode: "resolver-allowed",
    clientSecretResolverHint: "runtime-client-secret"
  },
  featureScopes: {
    "auth.social.profile": {
      allowedScopes: ["openid", "email", "profile"]
    },
    "mail.read.metadata": {
      allowedScopes: ["https://www.googleapis.com/auth/gmail.readonly"]
    },
    "mail.read.fullbody": {
      allowedScopes: ["https://mail.google.com/"],
      restrictedScopes: ["https://mail.google.com/"]
    },
    "mail.send": {
      allowedScopes: ["https://www.googleapis.com/auth/gmail.send"]
    },
    "profile.basic": {
      allowedScopes: ["openid", "email", "profile"]
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
      allowed: true
    },
    "mail.read.metadata": {
      allowed: true
    },
    "mail.read.fullbody": {
      allowed: true,
      requiredFeatureMode: "full-body"
    },
    "mail.send": {
      allowed: true
    },
    "oauth.revoke": {
      allowed: true
    }
  }
};
