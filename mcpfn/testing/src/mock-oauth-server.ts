import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { derivePkceS256Challenge, generatePkcePair } from "@superfunctions/oauth-core";

import {
  assertAuthorizationCodeClientMetadata,
  createOAuthClientMetadataVariants,
  type McpFnOAuthClientMetadataVariants,
} from "./auth-core.js";

interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  used: boolean;
}

interface AccessTokenRecord {
  clientId: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  revoked: boolean;
}

interface RefreshTokenRecord {
  clientId: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  revoked: boolean;
}

export interface McpFnMockOAuthServerOptions {
  issuer: string | URL;
  clientId?: string;
  redirectUris?: string[];
  scopesSupported?: string[];
  accessTokenLifetimeSeconds?: number;
  authorizationCodeLifetimeSeconds?: number;
  refreshTokenLifetimeSeconds?: number;
  clock?: () => number;
}

export interface McpFnMockOAuthTokenSet {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
  resource?: string;
}

export interface McpFnPkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

export interface McpFnOAuthCallback {
  url: string;
  parameters: Record<string, string>;
}

export function createPkcePair(): McpFnPkcePair {
  const pair = generatePkcePair(48);
  return {
    verifier: pair.codeVerifier,
    challenge: pair.codeChallenge,
    method: pair.codeChallengeMethod,
  };
}

function uniqueScopes(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(/\s+/).filter(Boolean))].sort();
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function oauthError(status: number, error: string, description: string): Response {
  return json(status, { error, error_description: description });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formValue(form: URLSearchParams, name: string): string | undefined {
  const value = form.get(name);
  return value === null || value === "" ? undefined : value;
}

export class McpFnMockOAuthAuthorizationServer {
  readonly issuer: URL;
  readonly clientId: string;
  readonly redirectUris: string[];
  readonly scopesSupported: string[];
  readonly clientMetadata: McpFnOAuthClientMetadataVariants;

  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly callbacks: McpFnOAuthCallback[] = [];
  private readonly clock: () => number;
  private readonly accessTokenLifetimeSeconds: number;
  private readonly authorizationCodeLifetimeSeconds: number;
  private readonly refreshTokenLifetimeSeconds: number;

  constructor(options: McpFnMockOAuthServerOptions) {
    this.issuer = new URL(options.issuer);
    this.issuer.pathname = this.issuer.pathname.replace(/\/?$/, "/");
    this.clientId = options.clientId ?? "mcpfn-playwright";
    this.redirectUris = options.redirectUris?.map((uri) => new URL(uri).toString()) ?? [
      new URL("callback", this.issuer).toString(),
    ];
    this.scopesSupported = [...new Set(options.scopesSupported ?? ["mcp:read", "mcp:write"])].sort();
    this.clock = options.clock ?? Date.now;
    this.accessTokenLifetimeSeconds = options.accessTokenLifetimeSeconds ?? 300;
    this.authorizationCodeLifetimeSeconds = options.authorizationCodeLifetimeSeconds ?? 120;
    this.refreshTokenLifetimeSeconds = options.refreshTokenLifetimeSeconds ?? 3_600;
    this.clientMetadata = createOAuthClientMetadataVariants(
      this.issuer,
      this.redirectUris[0],
    );
  }

  get metadataUrl(): string {
    return new URL(".well-known/oauth-authorization-server", this.issuer).toString();
  }

  get authorizationEndpoint(): string {
    return new URL("authorize", this.issuer).toString();
  }

  get tokenEndpoint(): string {
    return new URL("token", this.issuer).toString();
  }

  get revocationEndpoint(): string {
    return new URL("revoke", this.issuer).toString();
  }

  get callbackUrl(): string {
    return this.redirectUris[0];
  }

  clientMetadataUrl(
    variant: keyof McpFnOAuthClientMetadataVariants,
  ): string {
    return this.clientMetadata[variant].client_id;
  }

  authorizationUrl(input: {
    clientId?: string;
    redirectUri?: string;
    codeChallenge: string;
    state?: string;
    scopes?: string[];
    resource?: string;
    extraParameters?: Record<string, string>;
  }): string {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", input.clientId ?? this.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri ?? this.callbackUrl);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("scope", (input.scopes ?? ["mcp:read"]).join(" "));
    if (input.state) url.searchParams.set("state", input.state);
    if (input.resource) url.searchParams.set("resource", input.resource);
    for (const [name, value] of Object.entries(input.extraParameters ?? {})) {
      url.searchParams.set(name, value);
    }
    return url.toString();
  }

  latestCallback(): McpFnOAuthCallback | undefined {
    return this.callbacks.at(-1);
  }

  expireAccessToken(token: string): void {
    const record = this.accessTokens.get(token);
    if (record) record.expiresAt = this.nowSeconds() - 1;
  }

  revokeToken(token: string): void {
    const access = this.accessTokens.get(token);
    if (access) access.revoked = true;
    const refresh = this.refreshTokens.get(token);
    if (refresh) refresh.revoked = true;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.accessTokens.get(token);
    if (!record || record.revoked || record.expiresAt <= this.nowSeconds()) {
      throw new Error("Invalid access token");
    }
    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      ...(record.resource ? { resource: new URL(record.resource) } : {}),
    };
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(this.issuer.pathname.replace(/\/$/, ""), "") || "/";
    if (request.method === "GET" && path === "/.well-known/oauth-authorization-server") {
      return json(200, {
        issuer: this.issuer.toString(),
        authorization_endpoint: this.authorizationEndpoint,
        token_endpoint: this.tokenEndpoint,
        revocation_endpoint: this.revocationEndpoint,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: this.scopesSupported,
        client_id_metadata_document_supported: true,
      });
    }

    if (request.method === "GET" && path.startsWith("/client-metadata/")) {
      const metadata = Object.values(this.clientMetadata)
        .find((candidate) => new URL(candidate.client_id).pathname === url.pathname);
      return metadata ? json(200, metadata) : json(404, { error: "not_found" });
    }

    if (request.method === "GET" && path === "/authorize") {
      return this.authorize(url);
    }
    if (request.method === "POST" && path === "/token") {
      return this.token(await request.text());
    }
    if (request.method === "POST" && path === "/revoke") {
      return this.revoke(await request.text());
    }
    if (request.method === "GET" && path === "/callback") {
      const parameters = Object.fromEntries(url.searchParams);
      this.callbacks.push({ url: url.toString(), parameters });
      return new Response(
        `<!doctype html><html><body><main><h1>OAuth callback received</h1><pre>${escapeHtml(JSON.stringify(parameters, null, 2))}</pre></main></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return json(404, { error: "not_found" });
  }

  private nowSeconds(): number {
    return Math.floor(this.clock() / 1_000);
  }

  private resolveClient(clientId: string): { clientId: string; redirectUris: string[] } | undefined {
    if (clientId === this.clientId) {
      return { clientId, redirectUris: this.redirectUris };
    }
    const metadata = Object.values(this.clientMetadata)
      .find((candidate) => candidate.client_id === clientId);
    if (!metadata) return undefined;
    assertAuthorizationCodeClientMetadata(metadata, clientId);
    return { clientId, redirectUris: metadata.redirect_uris };
  }

  private authorize(url: URL): Response {
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const client = this.resolveClient(clientId);
    if (!client) return oauthError(400, "invalid_client", "Unknown OAuth client");
    if (!client.redirectUris.includes(redirectUri)) {
      return oauthError(400, "invalid_request", "redirect_uri is not registered");
    }
    if (url.searchParams.get("response_type") !== "code") {
      return this.authorizationRedirect(url, redirectUri, "unsupported_response_type");
    }
    const codeChallenge = url.searchParams.get("code_challenge");
    if (!codeChallenge || url.searchParams.get("code_challenge_method") !== "S256") {
      return this.authorizationRedirect(url, redirectUri, "invalid_request", "PKCE S256 is required");
    }
    const requestedScopes = uniqueScopes(url.searchParams.get("scope"));
    if (requestedScopes.some((scope) => !this.scopesSupported.includes(scope))) {
      return this.authorizationRedirect(url, redirectUri, "invalid_scope");
    }
    const decision = url.searchParams.get("decision");
    if (!decision) {
      const hidden = [...url.searchParams]
        .filter(([name]) => name !== "decision")
        .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
        .join("");
      return new Response(
        `<!doctype html><html><body><main><h1>Authorize MCP client</h1><p>${escapeHtml(clientId)}</p><form method="get" action="${escapeHtml(this.authorizationEndpoint)}">${hidden}<button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form></main></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );
    }
    if (decision === "deny") {
      return this.authorizationRedirect(url, redirectUri, "access_denied");
    }
    if (decision !== "approve") {
      return oauthError(400, "invalid_request", "Unknown authorization decision");
    }
    const code = `mcpfn_code_${randomUUID()}`;
    this.codes.set(code, {
      clientId,
      redirectUri,
      codeChallenge,
      scopes: requestedScopes,
      resource: url.searchParams.get("resource") ?? undefined,
      expiresAt: this.nowSeconds() + this.authorizationCodeLifetimeSeconds,
      used: false,
    });
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state) callback.searchParams.set("state", state);
    return Response.redirect(callback, 302);
  }

  private authorizationRedirect(
    requestUrl: URL,
    redirectUri: string,
    error: string,
    description?: string,
  ): Response {
    const callback = new URL(redirectUri);
    callback.searchParams.set("error", error);
    if (description) callback.searchParams.set("error_description", description);
    const state = requestUrl.searchParams.get("state");
    if (state) callback.searchParams.set("state", state);
    return Response.redirect(callback, 302);
  }

  private token(source: string): Response {
    const form = new URLSearchParams(source);
    const grantType = formValue(form, "grant_type");
    if (grantType === "authorization_code") return this.exchangeAuthorizationCode(form);
    if (grantType === "refresh_token") return this.exchangeRefreshToken(form);
    return oauthError(400, "unsupported_grant_type", "The grant type is not supported");
  }

  private exchangeAuthorizationCode(form: URLSearchParams): Response {
    const code = formValue(form, "code");
    const record = code ? this.codes.get(code) : undefined;
    if (!record || record.used || record.expiresAt <= this.nowSeconds()) {
      return oauthError(400, "invalid_grant", "Authorization code is invalid or expired");
    }
    if (
      formValue(form, "client_id") !== record.clientId ||
      formValue(form, "redirect_uri") !== record.redirectUri
    ) {
      return oauthError(400, "invalid_grant", "Authorization code binding does not match");
    }
    const verifier = formValue(form, "code_verifier");
    const challenge = verifier ? derivePkceS256Challenge(verifier) : undefined;
    if (challenge !== record.codeChallenge) {
      return oauthError(400, "invalid_grant", "PKCE verification failed");
    }
    record.used = true;
    return json(200, this.issueTokenSet(record));
  }

  private exchangeRefreshToken(form: URLSearchParams): Response {
    const refreshToken = formValue(form, "refresh_token");
    const record = refreshToken ? this.refreshTokens.get(refreshToken) : undefined;
    if (!record || record.revoked || record.expiresAt <= this.nowSeconds()) {
      return oauthError(400, "invalid_grant", "Refresh token is invalid or expired");
    }
    if (formValue(form, "client_id") !== record.clientId) {
      return oauthError(400, "invalid_grant", "Refresh token client binding does not match");
    }
    const requestedScopes = form.has("scope")
      ? uniqueScopes(form.get("scope"))
      : record.scopes;
    if (requestedScopes.some((scope) => !record.scopes.includes(scope))) {
      return oauthError(400, "invalid_scope", "Refresh cannot increase granted scopes");
    }
    record.revoked = true;
    return json(200, this.issueTokenSet({ ...record, scopes: requestedScopes }));
  }

  private issueTokenSet(
    input: Pick<AccessTokenRecord, "clientId" | "scopes" | "resource">,
  ): McpFnMockOAuthTokenSet {
    const accessToken = `mcpfn_access_${randomUUID()}`;
    const refreshToken = `mcpfn_refresh_${randomUUID()}`;
    this.accessTokens.set(accessToken, {
      ...input,
      expiresAt: this.nowSeconds() + this.accessTokenLifetimeSeconds,
      revoked: false,
    });
    this.refreshTokens.set(refreshToken, {
      ...input,
      expiresAt: this.nowSeconds() + this.refreshTokenLifetimeSeconds,
      revoked: false,
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: this.accessTokenLifetimeSeconds,
      refresh_token: refreshToken,
      scope: input.scopes.join(" "),
      ...(input.resource ? { resource: input.resource } : {}),
    };
  }

  private revoke(source: string): Response {
    const token = new URLSearchParams(source).get("token");
    if (token) this.revokeToken(token);
    return new Response(null, { status: 200 });
  }
}

export interface McpFnStartedMockOAuthServer {
  origin: string;
  oauth: McpFnMockOAuthAuthorizationServer;
  close(): Promise<void>;
}

export interface McpFnStartMockOAuthServerOptions
  extends Omit<McpFnMockOAuthServerOptions, "issuer"> {
  hostname?: string;
  port?: number;
  /** Optional same-origin route used to compose a protected MCP fixture. */
  handle?(
    request: Request,
    oauth: McpFnMockOAuthAuthorizationServer,
  ): Promise<Response | undefined> | Response | undefined;
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    ...(body ? { body, duplex: "half" } : {}),
  };
  return new Request(new URL(req.url ?? "/", origin), init);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export async function startMockOAuthAuthorizationServer(
  options: McpFnStartMockOAuthServerOptions = {},
): Promise<McpFnStartedMockOAuthServer> {
  let oauth: McpFnMockOAuthAuthorizationServer | undefined;
  let origin = "";
  const server = createServer(async (req, res) => {
    try {
      if (!oauth) throw new Error("Mock OAuth server is not initialized");
      const request = await toRequest(req, origin);
      const custom = await options.handle?.(request.clone(), oauth);
      await writeResponse(res, custom ?? await oauth.handle(request));
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        error: "server_error",
        error_description: "Internal Server Error",
      }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.hostname ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  origin = `http://${address.address.includes(":") ? `[${address.address}]` : address.address}:${address.port}`;
  oauth = new McpFnMockOAuthAuthorizationServer({ ...options, issuer: origin });
  return {
    origin,
    oauth,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
