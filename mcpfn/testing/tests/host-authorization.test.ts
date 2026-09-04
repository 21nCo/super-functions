import { describe, expect, it } from "vitest";
import { McpFnRedirectMismatchError } from "@mcpfn/auth";

import {
  MCPFN_NAMED_OAUTH_HOST_FIXTURES,
  MCPFN_OAUTH_EXTENSION_GRANTS,
  annotateScenarioReportLayers,
  classifyMcpFnFailure,
  createMcpFnJUnitXml,
  createMcpFnScenarioReport,
  createNamedHostAuthorizationCase,
  createNamedHostIncompatibleGrantCase,
  createNamedHostRedirectDriftCase,
  namedHostAuthorizationCases,
} from "../src/index.js";

describe("independent named-host authorization cases", () => {
  it("keeps registration metadata independent from the generated authorization request", () => {
    const matching = createNamedHostAuthorizationCase("claude");
    expect(matching.registration.source).toBe("client-metadata-document");
    expect(matching.registration.grantTypes).toEqual(
      expect.arrayContaining([
        "authorization_code",
        "refresh_token",
        MCPFN_OAUTH_EXTENSION_GRANTS.jwtBearer,
      ]),
    );
    expect(matching.authorizationRequest.redirectUri).toBe(matching.registration.redirectUris[0]);

    const preflight = createNamedHostRedirectDriftCase("claude", "mcpfn-preflight");
    expect(preflight.registration.redirectUris).toEqual(MCPFN_NAMED_OAUTH_HOST_FIXTURES.claude.redirectUris);
    expect(preflight.authorizationRequest.redirectUri).toBe("https://claude.example.com/unregistered");
    expect(preflight.clientRequestMetadata.redirectUris).not.toContain(
      preflight.authorizationRequest.redirectUri,
    );
    expect(preflight.expectedLayer).toBe("mcpfn-preflight");

    const authorizationServer = createNamedHostRedirectDriftCase("chatgpt", "authorization-server");
    expect(authorizationServer.registration.redirectUris).toEqual(
      MCPFN_NAMED_OAUTH_HOST_FIXTURES.chatgpt.redirectUris,
    );
    expect(authorizationServer.authorizationRequest.redirectUri).toBe(
      "https://chatgpt.com/wrong-callback",
    );
    expect(authorizationServer.clientRequestMetadata.redirectUris).toContain(
      authorizationServer.authorizationRequest.redirectUri,
    );
    expect(authorizationServer.expectedLayer).toBe("authorization-server");

    const incompatible = createNamedHostIncompatibleGrantCase("chatgpt");
    expect(incompatible.registration.grantTypes).toEqual([MCPFN_OAUTH_EXTENSION_GRANTS.deviceCode]);
    expect(incompatible.registration.metadata.grant_types).toEqual([
      MCPFN_OAUTH_EXTENSION_GRANTS.deviceCode,
    ]);
    expect(incompatible.authorizationRequest.redirectUri).toBe(incompatible.registration.redirectUris[0]);
    expect(namedHostAuthorizationCases()).toHaveLength(8);
  });

  it("classifies redacted failures onto the owning protocol layer", () => {
    expect(classifyMcpFnFailure(new McpFnRedirectMismatchError(
      "https://chatgpt.com/wrong-callback",
    ))).toBe("mcpfn-preflight");
    expect(classifyMcpFnFailure({
      name: "McpFnAuthAssertionError",
      message: "OAuth client metadata does not support authorization_code",
    })).toBe("mcpfn-preflight");
    expect(classifyMcpFnFailure({
      name: "McpFnHostedAuthorizationError",
      code: "unauthorized_client",
      message: "The client has no compatible authorization_code flow",
    })).toBe("mcpfn-preflight");
    expect(classifyMcpFnFailure({
      name: "McpFnHostedAuthorizationError",
      code: "invalid_request",
      message: "The authorization redirect URI is not registered for this MCP client",
      details: { phase: "redirect-validation" },
    })).toBe("authorization-server");
    expect(classifyMcpFnFailure({
      code: "unsupported_grant_type",
      message: "The requested OAuth grant is not supported",
    })).toBe("authorization-server");
    expect(classifyMcpFnFailure({
      name: "McpFnClientError",
      code: "MCPFN_AUTHORIZATION_REQUIRED",
      phase: "transport-connect",
      message: "authorization required",
    })).toBe("resource-server");
    expect(classifyMcpFnFailure({
      name: "McpFnClientError",
      code: "MCPFN_CONNECT_FAILED",
      phase: "mcp-initialize",
      message: "initialize failed",
    })).toBe("mcp-initialization");
  });

  it("emits redacted JUnit XML that names the failing scenario and layer", () => {
    const report = annotateScenarioReportLayers(createMcpFnScenarioReport([{
      formatVersion: 1,
      name: "unregistered ChatGPT callback",
      operation: "auth.assert",
      status: "failed",
      sideEffect: "none",
      durationMs: 12,
      error: "invalid_request at https://login.example/authorize?code=secret-code",
    }]));
    const xml = createMcpFnJUnitXml({
      name: "mcpfn.hosted-role3",
      results: report.results,
    });
    expect(xml).toContain('classname="authorization-server"');
    expect(xml).toContain("unregistered ChatGPT callback");
    expect(xml).toContain("failures=\"1\"");
    expect(xml).not.toContain("secret-code");
    expect(xml).toContain("REDACTED");
  });
});
