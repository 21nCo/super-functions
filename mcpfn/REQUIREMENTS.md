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

## MCP-3 requirements

| ID | Requirement | Deterministic evidence |
| --- | --- | --- |
| MCP3-AC-01 | Verified identity, protocol capabilities, and catalog behavior are distinct profile inputs. | core client-profile contract tests |
| MCP3-AC-02 | Generic clients retain the canonical catalog when no profile matches. | core lifecycle tests and generic suite case |
| MCP3-AC-03 | Catalog projection and trusted enrichment share one production call-preparation lifecycle. | server list/call path and `prepareToolCall` |
| MCP3-AC-04 | Server-owned required fields can be omitted from the model-visible schema and restored from trusted context. | hosted profile lifecycle tests |
| MCP3-AC-05 | Unknown additional properties retain instance path, schema path, keyword, and rejected property name. | validation issue tests |
| MCP3-AC-06 | Asymmetric projection/enrichment, stale snapshots, missing trusted context, and forged server-owned metadata fail closed. | core and testing-package negative cases |
| MCP3-AC-07 | Compatibility reports are bounded and redact credentials, tokens, and argument values. | testing-package redaction test and CLI `test-profiles` |
| MCP3-AC-08 | Protocol conformance, product scenarios, client-profile compatibility, and live-client evidence stay separate. | `TESTING.md` layer table |
