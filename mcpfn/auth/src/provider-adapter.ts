import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { HandleRequestOptions } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

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

/** Structural subset implemented by AuthFn and other authentication providers. */
export interface McpFnAuthSessionLike {
  id: string;
  type: string;
  subject: {
    actorId: string;
    actorType: string;
    tenantId?: string;
    regionId?: string;
  };
  resourceIds?: string[];
  scopes?: string[];
  methods?: string[];
  expiresAt?: Date;
  metadata?: unknown;
}

/** AuthFn is optional: consumers can pass any provider matching this contract. */
export interface McpFnAuthProviderLike<TSession extends McpFnAuthSessionLike> {
  authenticate(request: Request): Promise<TSession | null>;
  authorize?(session: TSession, resourceId: string): Promise<boolean>;
  revoke?(sessionId: string): Promise<void>;
}

export interface McpFnAuthProviderAdapterOptions<TSession extends McpFnAuthSessionLike> {
  provider: McpFnAuthProviderLike<TSession>;
  resource: string | URL;
  map?(session: TSession, request: Request): McpFnPrincipal | Promise<McpFnPrincipal>;
  authorize?(input: {
    principal: McpFnPrincipal;
    request: Request;
  }): boolean | Promise<boolean>;
  requiredScopes?:
    | string[]
    | ((input: {
        principal: McpFnPrincipal;
        request: Request;
      }) => string[] | Promise<string[]>);
}

export interface McpFnAuthProviderAdapter<TSession extends McpFnAuthSessionLike> {
  authenticate(request: Request): Promise<{
    session: TSession;
    principal: McpFnPrincipal;
    authInfo: AuthInfo;
  } | null>;
}

export function createMcpFnAuthProviderAdapter<TSession extends McpFnAuthSessionLike>(
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

export function createAuthProviderMcpHandler<TSession extends McpFnAuthSessionLike>(
  mcpHandler: McpFnWebStandardHandler,
  options: McpFnAuthProviderAdapterOptions<TSession>,
): (request: Request) => Promise<Response> {
  const adapter = createMcpFnAuthProviderAdapter(options);
  const metadataUrl = protectedResourceMetadataUrl(options.resource);
  return async (request) => {
    let authenticated;
    const authenticationRequest = request.clone();
    try {
      authenticated = await adapter.authenticate(authenticationRequest);
    } catch {
      authenticated = null;
    } finally {
      void authenticationRequest.body?.cancel().catch(() => undefined);
    }
    if (!authenticated) {
      return bearerChallengeResponse(401, metadataUrl, {
        error: "invalid_token",
        description: "A valid Bearer access token is required",
      });
    }
    let requiredScopes: string[];
    if (typeof options.requiredScopes === "function") {
      const scopeRequest = request.clone();
      try {
        requiredScopes = await options.requiredScopes({
          principal: authenticated.principal,
          request: scopeRequest,
        });
      } finally {
        void scopeRequest.body?.cancel().catch(() => undefined);
      }
    } else {
      requiredScopes = options.requiredScopes ?? [];
    }
    const grantedScopes = new Set(authenticated.principal.scopes);
    const missingScopes = [...new Set(requiredScopes)].filter(
      (scope) => !grantedScopes.has(scope),
    );
    if (missingScopes.length) {
      return bearerChallengeResponse(403, metadataUrl, {
        error: "insufficient_scope",
        description: "The Bearer credential lacks required scopes",
        scope: [...new Set(requiredScopes)]
          .sort((left, right) => left.localeCompare(right))
          .join(" "),
      });
    }
    const handleOptions: HandleRequestOptions = { authInfo: authenticated.authInfo };
    return mcpHandler(request, handleOptions);
  };
}

function defaultPrincipal(session: McpFnAuthSessionLike): McpFnPrincipal {
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
