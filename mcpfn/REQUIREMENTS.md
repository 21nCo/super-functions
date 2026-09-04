# MCP-2 requirements

This file is the version-controlled acceptance contract for the first McpFn
quality-platform release. The identifiers are stable even while individual
tests and package layouts evolve.

| ID | Requirement | Deterministic evidence |
| --- | --- | --- |
| MCP2-AC-01 | Package responsibilities and dependency direction are explicit. | `ARCHITECTURE.md`, package manifests, release package registry |
| MCP2-AC-02 | Typed server and client happy paths use one declaration/runtime contract. | core declaration tests and calculator example gate |
| MCP2-AC-03 | The production client covers stdio, HTTP, capabilities, tasks, events, cancellation, and client-mediated handlers. | client transport and client-mediated tests |
| MCP2-AC-04 | OAuth lifecycle state, storage, cleanup, diagnostics, and redaction are deterministic. | auth platform and OAuth core tests |
| MCP2-AC-05 | The redirect, metadata, PKCE/state, token-auth, refresh, revoke, denial, expiry, and grant matrix is covered. | `TEST_VECTORS.md`, auth and testing suites |
| MCP2-AC-06 | Independently supplied redirect drift fails before user-agent launch. | OAuth client compatibility regression |
| MCP2-AC-07 | McpFn owns the hosted MCP compatibility profile while the application remains token authority. | typed hosted token-authority tests |
| MCP2-AC-08 | Named ChatGPT- and Claude-shaped flows reach a protected MCP operation. | named-host production lifecycle test |
| MCP2-AC-09 | Overlap and single-writer migration boundaries are explicit. | `ADOPTION.md` and named DataFn consumer gate |
| MCP2-AC-10 | Trusted auth context never comes from tool arguments and provider authorization is preserved. | provider adapter denial and mapping tests |
| MCP2-AC-11 | Shared OAuth primitives are reused and AuthFn remains optional. | OAuth core PKCE tests and packed dependency inspection |
| MCP2-AC-12 | In-memory, stdio, HTTP, and custom targets share the production client engine. | target suite and installed-package round trips |
| MCP2-AC-13 | CLI and programmatic artifacts are redacted, bounded, versioned, and use stable exits. | scenario/report and CLI exit tests |
| MCP2-AC-14 | MCP-1 conformance plugs into the shared target/session engine. | official conformance gate |
| MCP2-AC-15 | The inspector observes bounded diagnostics and events and exports runner-compatible scenarios. | inspector round-trip and bound tests |
| MCP2-AC-16 | Node 22 release checks cover packages, examples, installed tarballs, conformance, OAuth, artifacts, and a named consumer. | `npm run gate:mcpfn-release` |
| MCP2-AC-17 | Workspace, installed, published, controlled-live, and deployed proof are never conflated. | `TESTING.md` proof-level table |

The local release gate is authoritative for deterministic workspace and packed
installation claims. Registry publication, controlled provider smoke tests,
and deployment checks remain separate actions and must record their own
version, endpoint, and timestamp evidence.

# MCP-1 requirements

Transport-neutral regression and official conformance for remote MCP endpoints.
These identifiers are stable even while individual tests evolve. MCP-1 consumes
MCP-2 target, session, diagnostic, and hosted-authorization contracts; it does
not add a second production client or authorization implementation.

| ID | Requirement | Deterministic evidence |
| --- | --- | --- |
| MCP1-AC-01 | A third-party fixture can install released McpFn packages from the configured registry. | packed-consumer gate and `scripts/test-mcpfn-external-server.mjs` |
| MCP1-AC-02 | A remote MCP target is exercised by URL plus an explicit auth provider without `McpFnServer` or `McpFnRegistry`. | `authenticatedHttpTarget`, `connectAuthenticatedHttpTarget`, remote-target tests, external HTTP example |
| MCP1-AC-03 | Official conformance can test an authenticated loopback server using API-key or OAuth-derived headers. | `runAuthenticatedOfficialConformance`, `mcpfn conformance --header` |
| MCP1-AC-04 | The auth matrix covers authorization-code and refresh flows alongside advertised JWT-bearer, device-code, and custom grants. | `createOAuthClientMetadataVariants` and Playwright/auth suites |
| MCP1-AC-05 | Additional advertised grants do not cause metadata discovery to fail as `invalid_client` when a compatible supported flow exists. | extensible Client ID Metadata assertions |
| MCP1-AC-06 | Claude-shaped and ChatGPT-shaped fixtures define registration independently from the generated authorization request. | `createNamedHostAuthorizationCase` and host-authorization tests |
| MCP1-AC-07 | Valid authorization-code + PKCE completes against a hosted-server role-3 adapter; incompatible metadata and unregistered redirects fail with layer diagnostics. | hosted-role3 tests and `classifyMcpFnFailure` |
| MCP1-AC-08 | The harness inventories and reuses shared OAuth primitives rather than a second PKCE/state/token/redaction stack. | imports from `@mcpfn/auth`, `@mcpfn/client`, and `@superfunctions/oauth-core` |
| MCP1-AC-09 | An actual unsupported token request is classified as `unsupported_grant_type`. | mock OAuth server and hosted-role3 token tests |
| MCP1-AC-10 | CI produces bounded, redacted, machine-readable artifacts that identify the failing scenario and protocol layer. | `createMcpFnJUnitXml`, `--junit`, `--output` |
| MCP1-AC-11 | Release automation verifies package exports, consumer installation, the external-server example, and the dedicated McpFn test gate. | `npm run gate:mcpfn-release` |
| MCP1-AC-12 | Documentation explains version pinning, authenticated conformance, remote targets, and upgrade policy. | `TESTING.md`, package READMEs |
