export type McpFnAuthCredentialKind = "api-key" | "oauth";

export interface McpFnAuthCredential {
  kind: McpFnAuthCredentialKind;
  headers: HeadersInit;
  label?: string;
  dispose?(): void | Promise<void>;
}

export interface McpFnAuthCredentialRequest {
  kind: McpFnAuthCredentialKind;
  scopes?: string[];
  resource?: string;
  expiresInSeconds?: number;
}

export interface McpFnAuthProviderCapabilities {
  expiration?: boolean;
  resourceBinding?: boolean;
  revocation?: boolean;
  scopes?: boolean;
}

/**
 * The application-owned seam. Skillplane only needs to map this interface to
 * its existing API-key or OAuth issuance and revocation helpers.
 */
export interface McpFnAuthProviderAdapter {
  capabilities?: McpFnAuthProviderCapabilities;
  issue(input: McpFnAuthCredentialRequest): Promise<McpFnAuthCredential>;
  revoke?(credential: McpFnAuthCredential): void | Promise<void>;
}

export interface McpFnAuthProbeScenario {
  name:
    | "missing-credential"
    | "invalid-credential"
    | "valid-credential"
    | "insufficient-scope"
    | "expired-credential"
    | "missing-resource"
    | "wrong-resource"
    | "revoked-credential";
  kind: McpFnAuthCredentialKind;
}

export interface McpFnAuthTarget {
  request(
    headers: Headers,
    scenario: McpFnAuthProbeScenario,
  ): Promise<Response>;
}

export interface McpFnAuthRegressionOptions {
  kind: McpFnAuthCredentialKind;
  provider: McpFnAuthProviderAdapter;
  target: McpFnAuthTarget;
  requiredScopes?: string[];
  resource?: string;
  wrongResource?: string;
  invalidCredentialHeaders?: HeadersInit;
  /** OAuth failures are required to advertise protected-resource metadata. */
  protectedResourceMetadataUrl?: string;
  expectedAuthenticatedStatuses?: number[];
  verifyAuthenticatedResponse?(
    response: Response,
    credential: McpFnAuthCredential,
  ): void | Promise<void>;
}

export interface McpFnAuthScenarioResult {
  name: McpFnAuthProbeScenario["name"];
  status: "passed" | "failed";
  responseStatus?: number;
  error?: string;
}

export interface McpFnBearerChallenge {
  scheme: string;
  parameters: Record<string, string>;
}

export class McpFnAuthAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpFnAuthAssertionError";
  }
}

function expectedStatus(
  response: Response,
  expected: number | number[],
  name: string,
): void {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) {
    throw new McpFnAuthAssertionError(
      `${name} expected HTTP ${statuses.join(" or ")}, received ${response.status}`,
    );
  }
}

export function parseBearerChallenge(
  header: string | null,
): McpFnBearerChallenge | undefined {
  if (!header) return undefined;
  const matches = [...header.matchAll(/(?:^|,)\s*([A-Za-z][A-Za-z0-9_-]*)\s+/g)];
  const selectedIndex = matches.findIndex((entry) => entry[1].toLowerCase() === "bearer");
  if (selectedIndex < 0) return undefined;
  const match = matches[selectedIndex];
  const start = (match.index ?? 0) + match[0].length;
  const end = matches[selectedIndex + 1]?.index ?? header.length;
  const parameters: Record<string, string> = {};
  const source = header.slice(start, end);
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;
  for (const entry of source.matchAll(pattern)) {
    const quoted = entry[2]?.replace(/\\(["\\])/g, "$1");
    parameters[entry[1]] = quoted ?? entry[3] ?? "";
  }
  return { scheme: match[1], parameters };
}

export function assertBearerResourceChallenge(
  response: Response,
  expectedMetadataUrl?: string,
): McpFnBearerChallenge {
  const challenge = parseBearerChallenge(response.headers.get("www-authenticate"));
  if (!challenge || challenge.scheme.toLowerCase() !== "bearer") {
    throw new McpFnAuthAssertionError("Expected a Bearer WWW-Authenticate challenge");
  }
  const metadataUrl = challenge.parameters.resource_metadata;
  if (!metadataUrl) {
    throw new McpFnAuthAssertionError(
      "Bearer challenge is missing the resource_metadata parameter",
    );
  }
  try {
    const parsed = new URL(metadataUrl);
    if (!parsed.protocol || !parsed.host) throw new Error("not absolute");
  } catch {
    throw new McpFnAuthAssertionError(
      `Bearer challenge has an invalid resource_metadata URL: ${metadataUrl}`,
    );
  }
  if (expectedMetadataUrl && metadataUrl !== expectedMetadataUrl) {
    throw new McpFnAuthAssertionError(
      `Expected resource_metadata=${expectedMetadataUrl}, received ${metadataUrl}`,
    );
  }
  return challenge;
}

export function bearerCredential(
  token: string,
  kind: McpFnAuthCredentialKind = "oauth",
): McpFnAuthCredential {
  return {
    kind,
    headers: { authorization: `Bearer ${token}` },
  };
}

export function apiKeyCredential(
  apiKey: string,
  options: { headerName?: string; scheme?: string } = {},
): McpFnAuthCredential {
  const headerName = options.headerName ?? "authorization";
  const value = options.scheme === ""
    ? apiKey
    : `${options.scheme ?? "Bearer"} ${apiKey}`;
  return { kind: "api-key", headers: { [headerName]: value } };
}

function invalidHeaders(options: McpFnAuthRegressionOptions): Headers {
  return new Headers(options.invalidCredentialHeaders ?? {
    authorization: `Bearer mcpfn-invalid-${options.kind}`,
  });
}

async function runOne(
  options: McpFnAuthRegressionOptions,
  scenario: McpFnAuthProbeScenario,
  prepare: () => Promise<McpFnAuthCredential | undefined>,
  expected: number | number[],
): Promise<McpFnAuthScenarioResult> {
  let credential: McpFnAuthCredential | undefined;
  try {
    credential = await prepare();
    const headers = credential
      ? new Headers(credential.headers)
      : scenario.name === "invalid-credential"
        ? invalidHeaders(options)
        : new Headers();
    const response = await options.target.request(headers, scenario);
    expectedStatus(response, expected, scenario.name);
    if (
      options.kind === "oauth" &&
      scenario.name !== "valid-credential"
    ) {
      assertBearerResourceChallenge(
        response,
        options.protectedResourceMetadataUrl,
      );
    }
    if (scenario.name === "valid-credential" && credential) {
      await options.verifyAuthenticatedResponse?.(response.clone(), credential);
    }
    return {
      name: scenario.name,
      status: "passed",
      responseStatus: response.status,
    };
  } catch (error) {
    return {
      name: scenario.name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await credential?.dispose?.();
  }
}

/** Runs the common API-key or OAuth resource-server regression matrix. */
export async function runAuthRegressionSuite(
  options: McpFnAuthRegressionOptions,
): Promise<McpFnAuthScenarioResult[]> {
  const issue = (overrides: Partial<McpFnAuthCredentialRequest> = {}) =>
    options.provider.issue({
      kind: options.kind,
      scopes: options.requiredScopes,
      resource: options.resource,
      ...overrides,
    });
  const results: McpFnAuthScenarioResult[] = [];
  results.push(await runOne(
    options,
    { name: "missing-credential", kind: options.kind },
    async () => undefined,
    401,
  ));
  results.push(await runOne(
    options,
    { name: "invalid-credential", kind: options.kind },
    async () => undefined,
    401,
  ));
  results.push(await runOne(
    options,
    { name: "valid-credential", kind: options.kind },
    () => issue(),
    options.expectedAuthenticatedStatuses ?? [200, 201, 202, 204],
  ));

  const capabilities = options.provider.capabilities ?? {};
  if (capabilities.scopes && options.requiredScopes?.length) {
    results.push(await runOne(
      options,
      { name: "insufficient-scope", kind: options.kind },
      () => issue({ scopes: [] }),
      403,
    ));
  }
  if (capabilities.expiration) {
    results.push(await runOne(
      options,
      { name: "expired-credential", kind: options.kind },
      () => issue({ expiresInSeconds: -60 }),
      401,
    ));
  }
  if (capabilities.resourceBinding && options.resource) {
    results.push(await runOne(
      options,
      { name: "missing-resource", kind: options.kind },
      () => issue({ resource: undefined }),
      401,
    ));
  }
  if (capabilities.resourceBinding && options.wrongResource) {
    results.push(await runOne(
      options,
      { name: "wrong-resource", kind: options.kind },
      () => issue({ resource: options.wrongResource }),
      401,
    ));
  }
  if (capabilities.revocation && options.provider.revoke) {
    results.push(await runOne(
      options,
      { name: "revoked-credential", kind: options.kind },
      async () => {
        const credential = await issue();
        await options.provider.revoke?.(credential);
        return credential;
      },
      401,
    ));
  }
  return results;
}

export async function assertAuthRegressionSuite(
  options: McpFnAuthRegressionOptions,
): Promise<McpFnAuthScenarioResult[]> {
  const results = await runAuthRegressionSuite(options);
  const failures = results.filter((result) => result.status === "failed");
  if (failures.length) {
    throw new McpFnAuthAssertionError(
      failures.map((failure) => `${failure.name}: ${failure.error}`).join("\n"),
    );
  }
  return results;
}

export interface McpFnFetchAuthTargetOptions {
  url: string | URL;
  fetch?: typeof globalThis.fetch;
  requestInit?: RequestInit | ((scenario: McpFnAuthProbeScenario) => RequestInit);
}

/** Creates a protected MCP initialize probe suitable for local or deployed endpoints. */
export function createFetchAuthTarget(
  options: McpFnFetchAuthTargetOptions,
): McpFnAuthTarget {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    throw new Error("A fetch implementation is required");
  }
  return {
    async request(authHeaders, scenario) {
      const configured = typeof options.requestInit === "function"
        ? options.requestInit(scenario)
        : options.requestInit ?? {};
      const headers = new Headers(configured.headers);
      headers.set("accept", "application/json, text/event-stream");
      headers.set("content-type", "application/json");
      authHeaders.forEach((value, name) => headers.set(name, value));
      return fetchImplementation(options.url, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `mcpfn-auth-${scenario.name}`,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "mcpfn-auth-test", version: "1.0.0" },
          },
        }),
        ...configured,
        headers,
      });
    },
  };
}

export const MCPFN_OAUTH_EXTENSION_GRANTS = {
  jwtBearer: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  deviceCode: "urn:ietf:params:oauth:grant-type:device_code",
  generic: "urn:example:params:oauth:grant-type:extension",
} as const;

export interface McpFnOAuthClientMetadata extends Record<string, unknown> {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  response_types: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
}

export interface McpFnOAuthClientMetadataFixtureOptions {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  extraGrantTypes?: string[];
  extraMetadata?: Record<string, unknown>;
}

export interface McpFnOAuthClientMetadataVariants {
  basic: McpFnOAuthClientMetadata;
  jwtBearerExtension: McpFnOAuthClientMetadata;
  deviceCodeExtension: McpFnOAuthClientMetadata;
  genericExtension: McpFnOAuthClientMetadata;
}

export function createOAuthClientMetadataFixture(
  options: McpFnOAuthClientMetadataFixtureOptions,
): McpFnOAuthClientMetadata {
  return {
    ...options.extraMetadata,
    client_id: new URL(options.clientId).toString(),
    client_name: options.clientName ?? "McpFn OAuth test client",
    redirect_uris: [...new Set(options.redirectUris.map((uri) => new URL(uri).toString()))],
    response_types: ["code"],
    grant_types: [
      "authorization_code",
      "refresh_token",
      ...new Set(options.extraGrantTypes ?? []),
    ],
    token_endpoint_auth_method: "none",
  };
}

export function createOAuthClientMetadataVariants(
  baseUrl: string | URL,
  redirectUri = new URL("/callback", baseUrl).toString(),
): McpFnOAuthClientMetadataVariants {
  const base = new URL(baseUrl);
  const fixture = (name: string, extraGrantTypes: string[] = []) =>
    createOAuthClientMetadataFixture({
      clientId: new URL(`/client-metadata/${name}`, base).toString(),
      redirectUris: [redirectUri],
      clientName: `McpFn ${name} client`,
      extraGrantTypes,
    });
  return {
    basic: fixture("basic"),
    jwtBearerExtension: fixture("jwt-bearer-extension", [MCPFN_OAUTH_EXTENSION_GRANTS.jwtBearer]),
    deviceCodeExtension: fixture("device-code-extension", [MCPFN_OAUTH_EXTENSION_GRANTS.deviceCode]),
    genericExtension: fixture("generic-extension", [MCPFN_OAUTH_EXTENSION_GRANTS.generic]),
  };
}

/**
 * Validates compatibility with authorization-code + PKCE without applying a
 * closed-world allowlist to unrelated grant types advertised by the client.
 */
export function assertAuthorizationCodeClientMetadata(
  metadata: McpFnOAuthClientMetadata,
  expectedClientId?: string,
): McpFnOAuthClientMetadata {
  if (expectedClientId && metadata.client_id !== new URL(expectedClientId).toString()) {
    throw new McpFnAuthAssertionError("OAuth client metadata client_id does not match its document URL");
  }
  if (!metadata.response_types.includes("code")) {
    throw new McpFnAuthAssertionError("OAuth client metadata does not support response_type=code");
  }
  if (!metadata.grant_types.includes("authorization_code")) {
    throw new McpFnAuthAssertionError("OAuth client metadata does not support authorization_code");
  }
  if (!metadata.redirect_uris.length) {
    throw new McpFnAuthAssertionError("OAuth client metadata must declare at least one redirect URI");
  }
  return metadata;
}
