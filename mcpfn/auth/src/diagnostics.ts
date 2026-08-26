import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { redactOAuthValue } from "@superfunctions/oauth-core";

export interface McpFnAuthorizationDiagnosticStep {
  phase: "resource-discovery" | "authorization-server-discovery";
  status: "passed" | "failed";
  durationMs: number;
  error?: string;
}

export interface McpFnAuthorizationDiagnosticReport {
  ok: boolean;
  target: string;
  resourceMetadata?: OAuthProtectedResourceMetadata;
  authorizationServerMetadata?: AuthorizationServerMetadata;
  steps: McpFnAuthorizationDiagnosticStep[];
}

export interface DiagnoseMcpAuthorizationOptions {
  fetchImplementation?: typeof fetch;
  protocolVersion?: string;
  resourceMetadataUrl?: string | URL;
  timeoutMs?: number;
}

/** Read-only discovery probe. It does not open a browser or exchange credentials. */
export async function diagnoseMcpAuthorization(
  target: string | URL,
  options: DiagnoseMcpAuthorizationOptions = {},
): Promise<McpFnAuthorizationDiagnosticReport> {
  const targetUrl = new URL(target.toString());
  targetUrl.hash = "";
  const steps: McpFnAuthorizationDiagnosticStep[] = [];
  const fetchImplementation = boundedFetch(
    options.fetchImplementation ?? globalThis.fetch,
    options.timeoutMs ?? 10_000,
  );
  let resourceMetadata: OAuthProtectedResourceMetadata | undefined;
  let authorizationServerMetadata: AuthorizationServerMetadata | undefined;

  const resourceStartedAt = performance.now();
  try {
    resourceMetadata = await discoverOAuthProtectedResourceMetadata(
      targetUrl,
      {
        protocolVersion: options.protocolVersion,
        resourceMetadataUrl: options.resourceMetadataUrl,
      },
      fetchImplementation,
    );
    steps.push({
      phase: "resource-discovery",
      status: "passed",
      durationMs: performance.now() - resourceStartedAt,
    });
  } catch (error) {
    steps.push({
      phase: "resource-discovery",
      status: "failed",
      durationMs: performance.now() - resourceStartedAt,
      error: errorMessage(error),
    });
    return redactReport({ ok: false, target: targetUrl.toString(), steps });
  }

  const authorizationServerUrl = resourceMetadata?.authorization_servers?.[0]
    ?? targetUrl.origin;
  const authorizationStartedAt = performance.now();
  try {
    authorizationServerMetadata = await discoverAuthorizationServerMetadata(
      authorizationServerUrl,
      {
        fetchFn: fetchImplementation,
        protocolVersion: options.protocolVersion,
      },
    );
    if (!authorizationServerMetadata) {
      throw new Error("No RFC 8414 or OpenID Connect authorization metadata was found");
    }
    steps.push({
      phase: "authorization-server-discovery",
      status: "passed",
      durationMs: performance.now() - authorizationStartedAt,
    });
  } catch (error) {
    steps.push({
      phase: "authorization-server-discovery",
      status: "failed",
      durationMs: performance.now() - authorizationStartedAt,
      error: errorMessage(error),
    });
  }

  return redactReport({
    ok: steps.every((step) => step.status === "passed"),
    target: targetUrl.toString(),
    resourceMetadata,
    authorizationServerMetadata,
    steps,
  });
}

function boundedFetch(fetchImplementation: typeof fetch, timeoutMs: number): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("McpFn authorization diagnostic timeoutMs must be positive");
  }
  return async (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return fetchImplementation(input, { ...init, signal });
  };
}

function redactReport(report: McpFnAuthorizationDiagnosticReport): McpFnAuthorizationDiagnosticReport {
  return redactOAuthValue(report) as McpFnAuthorizationDiagnosticReport;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
