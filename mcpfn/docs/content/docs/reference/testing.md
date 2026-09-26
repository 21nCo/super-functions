---
title: Testing API
description: Source-aligned McpFn testing api documentation.
---

# McpFn Testing

`@mcpfn/testing` provides deterministic MCP regression testing over the official SDK's in-memory transport and against arbitrary stdio or Streamable HTTP MCP servers. It tests the protocol boundary rather than calling handlers directly; the server under test does not need to use McpFn.

It includes:

- the production McpFn client exposed as a fixture;
- exact manifest assertions across tools, resources, templates, and prompts;
- deterministic generic and authenticated client-profile catalogs, fixtures, and snapshots;
- resource, prompt, completion, subscription, and task client methods;
- reusable API-key and OAuth resource-server regression matrices;
- an in-memory authorization-code, PKCE, refresh, and revocation server;
- extensible Client ID Metadata fixtures that include unrelated grant types;
- optional Playwright fixtures for real redirect and consent-page coverage;
- generic tools-only, full-protocol, and MCP Apps host profiles;
- named ChatGPT- and Claude-shaped OAuth metadata fixtures;
- one suite for in-memory, custom, stdio, and Streamable HTTP targets;
- structured/text response parity checks;
- version 1 declarative scenarios for capabilities, tasks, events, and auth phases;
- per-scenario timeout/cancellation, side-effect and incomplete metadata;
- bounded, redacted scenario and target-suite reports;
- JSON and JUnit artifacts with package/runtime provenance and failure layers;
- orchestration of the official `@modelcontextprotocol/conformance` runner.

Official conformance validates protocol behavior. McpFn scenarios validate product behavior. Production MCP servers should run both. For a protected local endpoint, use `runAuthenticatedOfficialConformance({ url, credential })`; it requires a literal loopback upstream, binds a temporary loopback-only streaming proxy, pins every request to the configured upstream path, injects bounded credential headers without printing them, and closes the proxy and attempts credential revocation/disposal after the pinned official runner exits. Credential cleanup retries up to three times. If all attempts fail, it throws `McpFnConformanceCleanupError`; retain that error and call `await error.retryCleanup()` after the provider recovers. The error contains no raw credential fields, and a successful retry releases the retained lease.

Deterministic client-profile compatibility is a third, separate gate. It proves
the effective authenticated catalog, schema portability, trusted enrichment,
canonical validation, handler reachability, and structured error fidelity. It
does not replace protocol conformance or product scenarios and does not emulate
a proprietary hosted model.

Use `runMcpFnTargetSuite({ target, scenarios, manifest })` when a test should
exercise a subprocess or deployed target. It constructs the same session used
by applications, the inspector, and CLI. Scenario execution is serial and
capability calls are never retried implicitly.

```ts
import { writeFile } from "node:fs/promises";
import {
  McpFnTestClient,
  assertManifestContract,
  runScenarios,
} from "@mcpfn/testing";

const server = createServer();
const client = await McpFnTestClient.connect(server);
try {
  await assertManifestContract(client, server.manifest());
  const results = await runScenarios(client, [
    {
      name: "returns one skill",
      tool: "skill_get",
      arguments: { slug: "work-linear-issue" },
      expect: { isError: false, structuredTextParity: true },
    },
  ]);
  if (results.some((result) => result.status === "failed")) {
    throw new Error(JSON.stringify(results));
  }
} finally {
  await client.close();
}
```

## Client-profile contract suite

`runMcpFnClientProfileContracts()` accepts one case per generic or configured
profile. Each case supplies a production `McpFnTarget`, client initialization
metadata/capabilities, an optional reviewed snapshot, and explicit fixtures.
This supports in-memory, stdio, authenticated Streamable HTTP, and custom
targets without a test-only server adapter.

```ts
import {
  createMcpFnClientProfileSnapshot,
  runMcpFnClientProfileContracts,
} from "@mcpfn/testing";

const report = await runMcpFnClientProfileContracts({
  profiles: [{
    id: "generic",
    version: "canonical",
    target: genericTarget,
  }, {
    id: "consumer/trusted",
    version: "1",
    target: authenticatedTarget,
    clientInfo: { name: "consumer", version: "2.0.0" },
    capabilities: { roots: { listChanged: true } },
    expectedSnapshot: reviewedSnapshot,
    fixtures: [{
      name: "captured unknown property",
      tool: "lookup",
      arguments: capturedAndRedactedArguments,
      sideEffect: "read-only",
      source: "captured-failure",
      expect: {
        isError: true,
        errorCode: "MCPFN_INVALID_ARGUMENTS",
        lifecycleStage: "input-validation",
        validationIssue: {
          keyword: "additionalProperties",
          rejectedProperty: "unexpectedField",
        },
      },
    }],
  }],
});
```

Fixtures are executed through `McpFnTestClient.connectTarget()`, the same
production session engine used by applications, inspector, and CLI. Fixture
argument values never appear in reports. `read-only` fixtures run by default;
`idempotent` and `non-idempotent` fixtures require explicit suite or CLI
authorization.

The profile fixture runner supports ordinary tool calls. After reading the
effective catalog for each profile, it rejects a configuration containing a
fixture for a task-required tool before executing that profile's fixtures,
then closes its target. Earlier profiles may already have run. Use the task
scenario APIs for task execution and terminal-result assertions.

`createMcpFnClientProfileSnapshot()`,
`validateMcpFnClientProfileSnapshot()`, and
`diffMcpFnClientProfileSnapshots()` create reviewable effective-catalog
baselines. A diff rejects contradictory aggregate and per-tool hashes in
either direction; it does not recompute an aggregate from the stored tool hashes.
Portability validation compiles each schema using its declared
draft-07, 2019-09, or 2020-12 dialect and recursively reports reviewed
compatibility-sensitive keywords. Invalid schemas, dialects, and references
are errors; valid compatibility reductions are warnings unless policy promotes
them to errors.

## External authenticated targets

`authenticatedHttpTarget()` accepts a URL plus either a static credential or an
application-owned provider. The provider is responsible for acquiring the
credential and may revoke and dispose it. McpFn applies the headers only to the
fixed target, refuses redirect following, excludes credentials from target
descriptors and reports, and releases the credential exactly once even when
initialization fails.

```ts
import { writeFile } from "node:fs/promises";
import {
  authenticatedHttpTarget,
  createMcpFnTargetSuiteJUnit,
  disposeMcpFnTargetSuiteReport,
  runMcpFnTargetSuite,
  serializeMcpFnTargetSuiteReport,
} from "@mcpfn/testing";

const report = await runMcpFnTargetSuite({
  target: authenticatedHttpTarget("https://mcp.example.com/mcp", {
    credential: {
      kind: "api-key",
      headers: { "x-api-key": process.env.MCP_API_KEY! },
    },
  }),
  scenarios,
});

try {
  await writeFile(
    "mcpfn-report.json",
    serializeMcpFnTargetSuiteReport(report, { space: 2, trailingNewline: true }),
  );
  await writeFile("mcpfn-report.xml", createMcpFnTargetSuiteJUnit(report));
} finally {
  disposeMcpFnTargetSuiteReport(report);
}
```

Generated target-suite reports retain target-aware proof for deferred JSON and
JUnit composition. Use the serializers above for every required encoding, then
dispose the report in `finally`. A finalizer is only a fallback. Copies retain a
proof-required marker and fail closed because copied values cannot retain the
live credential validator. Every exact encoding must also fit the report's
original `maxReportBytes` cap; pretty JSON that exceeds it is rejected.

Use a provider instead of a static credential for short-lived OAuth access
tokens. Report failures identify `mcpfn-preflight`, `authorization-server`,
`resource-server`, `mcp-initialization`, `scenario`, or
`upstream-conformance` without serializing secret material.

Scenarios run serially so stateful workflows and idempotency checks remain
deterministic. Legacy arrays are readable; portable artifacts use
`{ formatVersion: 1, kind: "mcpfn.scenarios", status, scenarios }`. A runner
rejects an artifact whose top-level status is `incomplete`, even when its
individual scenarios are complete, so incomplete evidence cannot produce a
passing report. A runner
timeout supplies an abort signal and also bounds adapters that do not cooperate
with cancellation. `assertStructuredTextParity` requires a JSON text block; do
not use it for intentionally human-readable text.

`checkHostCompatibility(manifest, profile)` returns `compatible`, `degraded`, or `incompatible`. Unsupported optional server surfaces are degraded; missing protocol overlap or required client-mediated features are incompatible. The built-in profiles are stable capability fixtures, not claims about the current behavior of named commercial hosts. Supply a custom profile for a captured host version.

## Authentication regression suite

Import the transport-level testkit from `@mcpfn/testing/auth`. The application adapter owns only credential issuance and revocation; McpFn owns the common rejection and lifecycle matrix.

```ts
import {
  apiKeyCredential,
  assertAuthRegressionSuite,
  createFetchAuthTarget,
} from "@mcpfn/testing/auth";

await assertAuthRegressionSuite({
  kind: "api-key",
  target: createFetchAuthTarget({ url: "http://127.0.0.1:8787/mcp" }),
  invalidCredentialHeaders: { "x-api-key": "invalid" },
  provider: {
    capabilities: { revocation: true },
    async issue() {
      const key = await skillplaneTestAuth.issueApiKey();
      return apiKeyCredential(key.value, { headerName: "x-api-key", scheme: "" });
    },
    async revoke(credential) {
      await skillplaneTestAuth.revokeApiKey(credential);
    },
  },
});
```

OAuth adapters can additionally enable scope, expiry, resource-binding, and revocation scenarios. Rejected OAuth requests must include a Bearer challenge with `resource_metadata`; API keys intentionally do not inherit that OAuth-specific requirement.

`createOAuthClientMetadataVariants()` returns authorization-code clients with basic, JWT-bearer-extension, device-code-extension, and generic-extension metadata. The compatibility assertion requires authorization-code support while deliberately accepting unrelated grants, which catches closed-world Client ID Metadata validation regressions.

`createHostedAuthorizationFixtures()` keeps registration metadata independent
from the generated authorization request. The ChatGPT-shaped pre-registration,
Claude-shaped Client ID Metadata Document, and dynamic-registration cases cover
authorization code with S256 PKCE and refresh. Advertised JWT bearer, device,
and custom grants remain compatible when authorization code is supported, while
an actual unsupported token request must return `unsupported_grant_type`.
Allowed fixtures exchange the code returned by the authorization server. Set
the optional token-request `code` only to exercise an independently authored
negative case such as an expired or unknown authorization code.

## Playwright fixture

Install `@playwright/test` and import the ready-to-extend fixture from `@mcpfn/testing/playwright`:

```ts
import { expect, test } from "@mcpfn/testing/playwright";

test("accepts extensible OAuth client metadata", async ({ page, mcpfnOAuth }) => {
  const result = await mcpfnOAuth.authorize(page, {
    authorizationEndpoint: skillplane.authorizationEndpoint,
    clientId: mcpfnOAuth.server.clientMetadataUrl("jwtBearerExtension"),
    redirectUri: mcpfnOAuth.server.callbackUrl,
    scopes: ["mcp:read"],
    beforeDecision: async (currentPage) => signInIfRequired(currentPage),
  });
  expect(result.callback.parameters.code).toBeTruthy();
});
```

The fixture starts a local mock server that publishes authorization-server discovery, consent UI, callback capture, client metadata variants, PKCE token exchange, refresh rotation, revocation, and an SDK-compatible access-token verifier. Extend the exported `test` with Skillplane's signed-in page or database fixtures; do not copy the OAuth machinery into the application.

See [Testing and CI](https://github.com/21nCo/super-functions/blob/dev/mcpfn/TESTING.md) for the complete layered strategy.

Client-profile lifecycle evidence uses `invalid-arguments-handler` when a registered invalid-argument fallback runs. This stage does not imply that the tool handler ran; normal tool execution uses `handler`. Projected schemas select their declared JSON Schema dialect, defaulting to draft 7 to match canonical registry validation. Named `$anchor` definitions are portability-sensitive for older clients.

Projected catalogs support local JSON Pointer and named-anchor references. Dynamic and recursive reference forms fail closed until dialect-correct dynamic-scope comparison is supported. A recovered invalid-input call emits failed input-validation evidence followed by the invalid-argument fallback stage.

When credentials come from environment variables, pass their names in `sensitiveEnvironmentVariables` to authenticated official conformance. Those names are removed case-insensitively before the upstream runner is spawned. The library cannot infer the source of arbitrary provider-returned headers.

Authenticated official conformance always captures stdout and stderr, including when
`stdio: "inherit"` is requested, so credential values can be removed before output
is returned. `outputDir` is rejected before credentials are acquired because the
upstream runner writes raw artifacts directly. Persist the returned redacted result
if an authenticated run needs an artifact. Credential cleanup may be retried after
failure; successful revoke/dispose steps are not repeated.

Authenticated targets provide credential-aware redaction to client diagnostic/event listeners and inspector snapshots and exports while their credentials are active. Export raw operation results before closing the client; application-facing protocol return values retain their original contents. Recorded inspector events are scrubbed before storage.

When authenticated conformance cleanup exhausts retries, `McpFnConformanceCleanupError.result` retains the original runner stdout, stderr, exit code (or 1 for an otherwise successful run), and failure. A separate `cleanupFailure` records cleanup exhaustion; the overall result is failed. The CLI persists this redacted result before exiting nonzero.


### Retrying failed suite cleanup

If final session cleanup fails, `runMcpFnTargetSuite` rejects with
`McpFnTargetSuiteCleanupError`. Its `report` contains the bounded, redacted failed
snapshot. Retain the error and call `await error.retryCleanup()` to retry the
owned session cleanup. Concurrent retries share one operation; successful cleanup
releases ownership and later retries do nothing. A failed retry rejects with the
same safe error. Retrying does not rewrite the historical report as passing.
The CLI makes one cleanup retry and emits the failed report with exit code 1.

Direct `McpFnTestClient.connectTarget()` callers receive
`McpFnTestClientCleanupError` when connection failure is followed by cleanup
failure, and every connected client's public `close()` returns the same owner
contract if final cleanup fails. Retain that error and call
`await error.retryCleanup()`; the failed session remains owned until a retry
succeeds. Failed-connect cleanup preserves the original connection failure as
its `cause`; post-connect cleanup preserves the close failure.
