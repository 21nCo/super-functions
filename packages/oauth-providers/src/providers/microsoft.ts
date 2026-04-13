import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import type { ProviderPolicyDefinition } from "../policy-registry.js";

export const microsoftOAuthProviderDescriptor: OAuthProviderDescriptor = {
  id: "microsoft",
  authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  revocationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/logout",
  defaultScopes: ["openid", "email", "profile", "offline_access"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

export const microsoftProviderPolicy: ProviderPolicyDefinition = {
  providerId: "microsoft",
  policyVersion: "2026-03-11",
  descriptor: microsoftOAuthProviderDescriptor,
  capabilities: {
    supportsMailRead: true,
    supportsMailSend: true,
    supportsWatch: true,
    supportsRevoke: true,
    supportsManagedMailbox: true,
    allowedFeatureModes: ["metadata-only", "snippet", "full-body"]
  },
  featureScopes: {
    "mail.read.metadata": {
      allowedScopes: ["Mail.Read", "offline_access"]
    },
    "mail.read.fullbody": {
      allowedScopes: ["Mail.Read", "offline_access"],
      restrictedScopes: ["Mail.ReadWrite"]
    },
    "mail.send": {
      allowedScopes: ["Mail.Send", "offline_access"]
    },
    "profile.basic": {
      allowedScopes: ["openid", "email", "profile", "offline_access"]
    }
  },
  operationPolicies: {
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
