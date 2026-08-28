import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { HandleRequestOptions } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { bearerChallengeResponse, readBearerToken } from "./auth-response.js";

export interface McpFnProtectedResourceMetadata extends Record<string, unknown> {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_name?: string;
  resource_documentation?: string;
}

export interface McpFnProtectedResourceOptions {
  resource: string | URL;
  authorizationServers: Array<string | URL>;
  scopesSupported?: string[];
  resourceName?: string;
  resourceDocumentation?: string;
  extraMetadata?: Record<string, unknown>;
}

export interface McpFnOAuthResourceServerOptions
  extends McpFnProtectedResourceOptions {
  verifier: OAuthTokenVerifier;
  requiredScopes?: string[] | ((request: Request) => string[] | Promise<string[]>);
  clock?: () => number;
}

export type McpFnWebStandardHandler = (
  request: Request,
  options?: HandleRequestOptions,
) => Promise<Response>;

function normalizeResource(resource: string | URL): URL {
  const url = new URL(resource.toString());
  url.hash = "";
  return url;
}

function normalizeIdentifier(value: string | URL): string {
  const url = new URL(value.toString());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("OAuth authorization servers must use HTTP or HTTPS");
  }
  return url.pathname === "/" && !url.search && !url.hash
    ? url.origin
    : url.toString();
}

function unique(values: Array<string | URL>): string[] {
  return [...new Set(values.map(normalizeIdentifier))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function protectedResourceMetadataUrl(resource: string | URL): URL {
  const normalized = normalizeResource(resource);
  const path = normalized.pathname === "/" ? "" : normalized.pathname;
  return new URL(`/.well-known/oauth-protected-resource${path}`, normalized.origin);
}

export function createProtectedResourceMetadata(
  options: McpFnProtectedResourceOptions,
): McpFnProtectedResourceMetadata {
  const resource = normalizeResource(options.resource);
  if (!options.authorizationServers.length) {
    throw new Error("At least one OAuth authorization server is required");
  }
  return {
    ...options.extraMetadata,
    resource: resource.toString(),
    authorization_servers: unique(options.authorizationServers),
    ...(options.scopesSupported
      ? {
          scopes_supported: [...new Set(options.scopesSupported)].sort((left, right) =>
            left.localeCompare(right),
          ),
        }
      : {}),
    bearer_methods_supported: ["header"],
    ...(options.resourceName ? { resource_name: options.resourceName } : {}),
    ...(options.resourceDocumentation
      ? { resource_documentation: new URL(options.resourceDocumentation).toString() }
      : {}),
  };
}

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

export function createOAuthResourceServerHandler(
  mcpHandler: McpFnWebStandardHandler,
  options: McpFnOAuthResourceServerOptions,
): (request: Request) => Promise<Response> {
  const resource = normalizeResource(options.resource);
  const metadata = createProtectedResourceMetadata(options);
  const metadataUrl = protectedResourceMetadataUrl(resource);
  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    if (
      request.method === "GET" &&
      requestUrl.origin === metadataUrl.origin &&
      requestUrl.pathname === metadataUrl.pathname
    ) {
      return json(200, metadata, { "cache-control": "public, max-age=300" });
    }

    const token = readBearerToken(request);
    if (!token) {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "A Bearer access token is required",
      });
    }

    let authInfo: AuthInfo;
    try {
      authInfo = await options.verifier.verifyAccessToken(token);
    } catch {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "The access token is invalid",
      });
    }
    const now = Math.floor((options.clock?.() ?? Date.now()) / 1_000);
    if (authInfo.expiresAt !== undefined && authInfo.expiresAt <= now) {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "The access token has expired",
      });
    }
    if (
      !authInfo.resource ||
      normalizeResource(authInfo.resource).toString() !== resource.toString()
    ) {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "The access token is not bound to this resource",
      });
    }

    let requiredScopes: string[];
    if (typeof options.requiredScopes === "function") {
      const scopeRequest = request.clone();
      try {
        requiredScopes = await options.requiredScopes(scopeRequest);
      } finally {
        void scopeRequest.body?.cancel().catch(() => undefined);
      }
    } else {
      requiredScopes = options.requiredScopes ?? [];
    }
    const grantedScopes = new Set(authInfo.scopes);
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length) {
      return bearerChallengeResponse(403, metadataUrl, {
        error: "insufficient_scope",
        description: "The access token lacks required scopes",
        scope: [...new Set(requiredScopes)]
          .sort((left, right) => left.localeCompare(right))
          .join(" "),
      });
    }
    return mcpHandler(request, { authInfo });
  };
}
