import { BadRequestError } from "@superfunctions/http";
import type { AuthRouteMeta, HttpRouteMeta, OpenApiRouteMeta, Route, RouteContext } from "@superfunctions/http";
import type {
  OAuthFlowCallbackInput,
  OAuthFlowCallbackResult,
  OAuthFlowDisconnectInput,
  OAuthFlowService,
  OAuthFlowStartInput
} from "@superfunctions/oauth-flow";

export type OAuthBrowserCallbackMode = "redirect" | "json";

export type OAuthBrowserRouteMetaOverrides = {
  start?: HttpRouteMeta;
  callback?: HttpRouteMeta;
  disconnect?: HttpRouteMeta;
};

export interface OAuthBrowserRouteConfig {
  basePath: string;
  flowService: OAuthFlowService;
  resolveStartInput: (request: Request, context: RouteContext) => Promise<OAuthFlowStartInput> | OAuthFlowStartInput;
  resolveDisconnectInput?: (
    request: Request,
    context: RouteContext
  ) => Promise<Omit<OAuthFlowDisconnectInput, "providerId" | "requestId">> | Omit<OAuthFlowDisconnectInput, "providerId" | "requestId">;
  resolveCallbackInput?: (
    request: Request,
    context: RouteContext
  ) => Promise<Partial<Omit<OAuthFlowCallbackInput, "providerId" | "requestId">>> | Partial<Omit<OAuthFlowCallbackInput, "providerId" | "requestId">>;
  callbackMode?: OAuthBrowserCallbackMode | ((
    result: OAuthFlowCallbackResult,
    request: Request,
    context: RouteContext
  ) => Promise<OAuthBrowserCallbackMode> | OAuthBrowserCallbackMode);
  getRedirectLocation?: (
    result: OAuthFlowCallbackResult,
    request: Request,
    context: RouteContext
  ) => Promise<string> | string;
  /**
   * Additional origins (beyond the request's own origin) that a post-callback
   * redirect is permitted to target. Used to validate `returnTo` and prevent
   * open-redirect attacks. Same-origin redirects are always allowed.
   */
  allowedRedirectOrigins?: string[];
  serializeCallbackResult?: (
    result: OAuthFlowCallbackResult,
    request: Request,
    context: RouteContext
  ) => Promise<unknown> | unknown;
  routeMeta?: OAuthBrowserRouteMetaOverrides;
  requestIdHeader?: string;
}

export function createOAuthBrowserRoutes(config: OAuthBrowserRouteConfig): Route[] {
  assertValidRedirectOrigins(config.allowedRedirectOrigins);
  const requestIdHeader = (config.requestIdHeader ?? "x-request-id").toLowerCase();

  return [
    {
      method: "POST",
      path: joinPath(config.basePath, "start"),
      meta: resolveRouteMeta({ auth: { mode: "none" } }, config.routeMeta?.start),
      handler: async (request, context) => {
        const requestId = request.headers.get(requestIdHeader) ?? undefined;
        const input = await config.resolveStartInput(request, context);
        const result = await config.flowService.start({
          ...input,
          requestId: requestId ?? input.requestId
        });
        return Response.json(result);
      }
    },
    {
      method: "GET",
      path: joinPath(config.basePath, "callback/:provider"),
      meta: resolveRouteMeta({ auth: { mode: "none" } }, config.routeMeta?.callback),
      handler: async (request, context) => {
        const requestId = request.headers.get(requestIdHeader) ?? undefined;
        const resolvedInput = (await config.resolveCallbackInput?.(request, context)) ?? {};
        const url = new URL(request.url);
        const callbackResult = await config.flowService.handleCallback({
          providerId: context.params.provider,
          code: asRequiredString(resolvedInput.code ?? url.searchParams.get("code"), "code"),
          state: asRequiredString(resolvedInput.state ?? url.searchParams.get("state"), "state"),
          redirectUri: asRequiredString(
            resolvedInput.redirectUri ??
              url.searchParams.get("redirectUri") ??
              inferCallbackRedirectUri(url),
            "redirectUri"
          ),
          requestId
        });

        const mode = await resolveCallbackMode(config.callbackMode, callbackResult, request, context);
        if (mode === "redirect") {
          const location = await resolveRedirectLocation(config, callbackResult, request, context);
          return Response.redirect(location, 302);
        }

        const payload = config.serializeCallbackResult
          ? await config.serializeCallbackResult(callbackResult, request, context)
          : callbackResult;
        return Response.json(payload);
      }
    },
    {
      method: "POST",
      path: joinPath(config.basePath, "disconnect/:provider"),
      meta: resolveRouteMeta({ auth: { mode: "hybrid" } }, config.routeMeta?.disconnect),
      handler: async (request, context) => {
        const requestId = request.headers.get(requestIdHeader) ?? undefined;
        const input =
          (await config.resolveDisconnectInput?.(request, context)) ??
          (await parseDisconnectBody(request));

        const result = await config.flowService.disconnect({
          ...input,
          providerId: context.params.provider,
          requestId
        });
        return Response.json(result);
      }
    }
  ];
}

function assertValidRedirectOrigins(origins: readonly string[] | undefined): void {
  for (const origin of origins ?? []) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`OAUTH_ALLOWED_REDIRECT_ORIGIN_INVALID: ${origin}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`OAUTH_ALLOWED_REDIRECT_ORIGIN_INVALID: ${origin}`);
    }
  }
}

function resolveRouteMeta(defaultMeta: HttpRouteMeta, overrideMeta: HttpRouteMeta | undefined): HttpRouteMeta {
  if (!overrideMeta) {
    return defaultMeta;
  }

  return {
    ...defaultMeta,
    ...overrideMeta,
    auth: mergeAuthMeta(defaultMeta.auth, overrideMeta.auth),
    openapi: mergeOpenApiMeta(defaultMeta.openapi, overrideMeta.openapi)
  };
}

function mergeAuthMeta(
  defaultMeta: AuthRouteMeta | undefined,
  overrideMeta: AuthRouteMeta | undefined
): AuthRouteMeta | undefined {
  if (!defaultMeta) {
    return overrideMeta ? { ...overrideMeta } : undefined;
  }

  if (!overrideMeta) {
    return { ...defaultMeta };
  }

  return {
    ...defaultMeta,
    ...overrideMeta
  };
}

function mergeOpenApiMeta(
  defaultMeta: OpenApiRouteMeta | undefined,
  overrideMeta: OpenApiRouteMeta | undefined
): OpenApiRouteMeta | undefined {
  if (!defaultMeta) {
    return overrideMeta ? { ...overrideMeta } : undefined;
  }

  if (!overrideMeta) {
    return { ...defaultMeta };
  }

  return {
    ...defaultMeta,
    ...overrideMeta
  };
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return `${normalizedBase.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}

function asRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`${field} is required`, "OAUTH_ROUTE_INVALID_INPUT");
  }
  return value;
}

async function resolveCallbackMode(
  mode: OAuthBrowserRouteConfig["callbackMode"],
  result: OAuthFlowCallbackResult,
  request: Request,
  context: RouteContext
): Promise<OAuthBrowserCallbackMode> {
  if (!mode) {
    return "json";
  }

  if (typeof mode === "function") {
    return mode(result, request, context);
  }

  return mode;
}

async function resolveRedirectLocation(
  config: OAuthBrowserRouteConfig,
  result: OAuthFlowCallbackResult,
  request: Request,
  context: RouteContext
): Promise<string> {
  if (config.getRedirectLocation) {
    // Caller-provided resolvers are trusted to produce safe locations.
    return config.getRedirectLocation(result, request, context);
  }

  if (result.subject.kind === "browser-auth" && result.subject.returnTo) {
    // `returnTo` originates from the (unauthenticated) flow start request and
    // is attacker-influenceable, so it must be validated against the current
    // origin and any explicitly allowlisted origins to prevent open redirects.
    return sanitizeRedirectLocation(result.subject.returnTo, request, config.allowedRedirectOrigins);
  }

  return new URL("/", request.url).toString();
}

function sanitizeRedirectLocation(
  returnTo: string,
  request: Request,
  allowedRedirectOrigins?: string[]
): string {
  const requestUrl = new URL(request.url);
  const fallback = new URL("/", requestUrl).toString();

  let target: URL;
  try {
    // Resolve relative URLs against the request origin; absolute URLs are
    // parsed as-is so their origin can be checked.
    target = new URL(returnTo, requestUrl);
  } catch {
    return fallback;
  }

  // Only http(s) targets are ever acceptable (blocks javascript:, data:, etc.).
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fallback;
  }

  if (target.origin === requestUrl.origin) {
    return target.toString();
  }

  const allowed = new Set(
    (allowedRedirectOrigins ?? [])
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => origin !== null)
  );

  if (allowed.has(target.origin)) {
    return target.toString();
  }

  return fallback;
}

async function parseDisconnectBody(
  request: Request
): Promise<Omit<OAuthFlowDisconnectInput, "providerId" | "requestId">> {
  const body = asJsonObject(await parseJsonBody(request), "disconnect body") as {
    connectionId?: string;
    revokeRemote?: unknown;
    tokenTypeHint?: unknown;
  };

  return {
    connectionId: asRequiredString(body.connectionId, "connectionId"),
    revokeRemote: asOptionalBoolean(body.revokeRemote, "revokeRemote"),
    tokenTypeHint: asTokenTypeHint(body.tokenTypeHint)
  };
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("disconnect body must be valid JSON", "OAUTH_ROUTE_INVALID_INPUT");
  }
}

function inferCallbackRedirectUri(url: URL): string {
  const redirectUrl = new URL(url.toString());
  for (const transientParam of ["code", "state", "redirectUri", "error", "error_description", "error_uri"]) {
    redirectUrl.searchParams.delete(transientParam);
  }
  return redirectUrl.toString();
}

function asJsonObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be a JSON object`, "OAUTH_ROUTE_INVALID_INPUT");
  }
  return value as Record<string, unknown>;
}

function asOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new BadRequestError(`${field} must be a boolean`, "OAUTH_ROUTE_INVALID_INPUT");
  }
  return value;
}

function asTokenTypeHint(value: unknown): "access_token" | "refresh_token" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "access_token" || value === "refresh_token") {
    return value;
  }
  throw new BadRequestError("tokenTypeHint must be access_token or refresh_token", "OAUTH_ROUTE_INVALID_INPUT");
}
