import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import type { ProviderPolicyDefinition } from "../policy-registry.js";

export const yahooOAuthProviderDescriptor: OAuthProviderDescriptor = {
  id: "yahoo",
  authorizationUrl: "https://api.login.yahoo.com/oauth2/request_auth",
  tokenUrl: "https://api.login.yahoo.com/oauth2/get_token",
  revocationUrl: "https://api.login.yahoo.com/oauth2/revoke",
  defaultScopes: ["openid", "profile", "email"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

export const yahooProviderPolicy: ProviderPolicyDefinition = {
  providerId: "yahoo",
  policyVersion: "2026-03-11",
  descriptor: yahooOAuthProviderDescriptor,
  capabilities: {
    supportsMailRead: true,
    supportsMailSend: true,
    supportsWatch: false,
    supportsRevoke: true,
    supportsManagedMailbox: false,
    allowedFeatureModes: ["metadata-only", "snippet", "full-body"]
  },
  featureScopes: {
    "mail.read.metadata": {
      allowedScopes: ["mail-r", "openid", "email", "profile"]
    },
    "mail.read.fullbody": {
      allowedScopes: ["mail-r", "openid", "email", "profile"]
    },
    "mail.send": {
      allowedScopes: ["mail-w", "openid", "email", "profile"]
    },
    "profile.basic": {
      allowedScopes: ["openid", "email", "profile"]
    }
  },
  operationPolicies: {
    "mail.watch.create": {
      allowed: false,
      reason: "Yahoo does not support webhook watch creation"
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
