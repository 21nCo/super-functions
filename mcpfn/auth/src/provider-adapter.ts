import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { HandleRequestOptions } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthProvider, AuthSession } from "@superfunctions/auth";

import { bearerChallengeResponse, readBearerToken } from "./auth-response.js";
import {
  protectedResourceMetadataUrl,
  type McpFnWebStandardHandler,
} from "./resource-server.js";

export interface McpFnPrincipal {
  subject: string;
  clientId: string;
  scopes: string[];
  resourceIds: string[];
  expiresAt?: number;
  tenantId?: string;
  regionId?: string;
  authMethods?: string[];
  extra?: Record<string, unknown>;
}

export interface McpFnAuthProviderAdapterOptions<TSession extends AuthSession> {
  provider: AuthProvider<TSession>;
  resource: string | URL;
  map?(session: TSession, request: Request): McpFnPrincipal | Promise<McpFnPrincipal>;
  authorize?(input: {
    principal: McpFnPrincipal;
    request: Request;
  }): boolean | Promise<boolean>;
}

export interface McpFnAuthProviderAdapter<TSession extends AuthSession> {
  authenticate(request: Request): Promise<{
    session: TSession;
    principal: McpFnPrincipal;
    authInfo: AuthInfo;
  } | null>;
}

export function createMcpFnAuthProviderAdapter<TSession extends AuthSession>(
  options: McpFnAuthProviderAdapterOptions<TSession>,
): McpFnAuthProviderAdapter<TSession> {
  const resource = new URL(options.resource.toString());
  resource.hash = "";
  return {
    async authenticate(request) {
      const bearer = readBearerToken(request);
      if (!bearer) return null;
      const session = await options.provider.authenticate(request);
      if (!session) return null;
      const principal = options.map
        ? await options.map(session, request)
        : defaultPrincipal(session);
      if (
        options.provider.authorize &&
        !(await options.provider.authorize(session, resource.toString()))
      ) {
        return null;
      }
      if (options.authorize && !(await options.authorize({ principal, request }))) {
        return null;
      }
      return {
        session,
        principal,
        authInfo: {
          token: bearer,
          clientId: principal.clientId,
          scopes: [...principal.scopes],
          ...(principal.expiresAt !== undefined ? { expiresAt: principal.expiresAt } : {}),
          resource,
          extra: {
            ...principal.extra,
            subject: principal.subject,
            resourceIds: [...principal.resourceIds],
            ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
            ...(principal.regionId ? { regionId: principal.regionId } : {}),
            ...(principal.authMethods ? { authMethods: [...principal.authMethods] } : {}),
          },
        },
      };
    },
  };
}

export function createAuthProviderMcpHandler<TSession extends AuthSession>(
  mcpHandler: McpFnWebStandardHandler,
  options: McpFnAuthProviderAdapterOptions<TSession>,
): (request: Request) => Promise<Response> {
  const adapter = createMcpFnAuthProviderAdapter(options);
  const metadataUrl = protectedResourceMetadataUrl(options.resource);
  return async (request) => {
    let authenticated;
    try {
      authenticated = await adapter.authenticate(request.clone());
    } catch {
      authenticated = null;
    }
    if (!authenticated) {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "A valid Bearer access token is required",
      });
    }
    const handleOptions: HandleRequestOptions = { authInfo: authenticated.authInfo };
    return mcpHandler(request, handleOptions);
  };
}

function defaultPrincipal(session: AuthSession): McpFnPrincipal {
  return {
    subject: session.subject.actorId,
    clientId: session.id,
    scopes: [...(session.scopes ?? [])],
    resourceIds: [...(session.resourceIds ?? [])],
    ...(session.expiresAt
      ? { expiresAt: Math.floor(session.expiresAt.getTime() / 1_000) }
      : {}),
    ...(session.subject.tenantId ? { tenantId: session.subject.tenantId } : {}),
    ...(session.subject.regionId ? { regionId: session.subject.regionId } : {}),
    ...(session.methods ? { authMethods: [...session.methods] } : {}),
  };
}
