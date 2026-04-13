import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";

export type OAuthTokenGrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials";

export type OAuthTokenAuthMethod = "client_secret_post" | "client_secret_basic";

export interface OAuthResolvedClientSecret {
  clientSecret: string;
  tokenAuthMethod?: OAuthTokenAuthMethod;
}

export interface OAuthSecretResolverContext {
  provider: OAuthProviderDescriptor;
  operation: "exchange" | "revoke";
  clientId: string;
  grantType?: OAuthTokenGrantType;
  redirectUri?: string;
  scopes?: string[];
  tokenTypeHint?: "access_token" | "refresh_token";
}

export type OAuthClientSecretResolver = (
  input: OAuthSecretResolverContext
) => Promise<OAuthResolvedClientSecret> | OAuthResolvedClientSecret;

export interface OAuthTokenEndpointRequest {
  provider: OAuthProviderDescriptor;
  grantType: OAuthTokenGrantType;
  clientId: string;
  clientSecret?: string;
  clientSecretResolver?: OAuthClientSecretResolver;
  redirectUri?: string;
  code?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scopes?: string[];
}

export interface OAuthTokenEndpointResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
  raw?: unknown;
}

export interface OAuthRevocationRequest {
  provider: OAuthProviderDescriptor;
  clientId: string;
  clientSecret?: string;
  clientSecretResolver?: OAuthClientSecretResolver;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}

export interface OAuthTokenHttpClient {
  exchangeToken(input: OAuthTokenEndpointRequest): Promise<OAuthTokenEndpointResponse>;
  revokeToken(input: OAuthRevocationRequest): Promise<void>;
}

export * from "./errors.js";
export * from "./retry-policy.js";
export * from "./token-client.js";
