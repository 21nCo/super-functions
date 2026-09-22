# ADR 0001: McpFn runtime and compatibility policy

- Status: accepted
- Date: 2026-08-26
- Scope: pre-1.0 McpFn packages and quality artifacts

## Decision

All seven McpFn packages support Node.js 18.18 or newer. The guarded release
and official conformance environment is Node.js 22. `@mcpfn/core` and
`@mcpfn/auth` additionally support web-standard edge runtimes such as Cloudflare
Workers (see "Edge and Cloudflare Workers" below). The remaining top-level
package entries are Node runtimes: stdio, cryptography, module loading, and
local fixture tools are not advertised as browser or edge bundles. Desktop and
native products may consume a remote Streamable HTTP target or run the Node
client in a managed subprocess. No browser-specific export condition is provided
in this release.

The official MCP SDK is the only protocol, JSON-RPC, initialization, and
transport implementation. McpFn adds application declarations, lifecycle
ownership, OAuth compatibility policy, testing, artifacts, and inspection.

## Edge and Cloudflare Workers

`@mcpfn/core` and `@mcpfn/auth` ship self-contained bundles: the official MCP
SDK and a single pinned Zod runtime are inlined into each package's `dist`
output. A consumer can bundle either package for a Cloudflare Worker alongside
its own root `zod` dependency without adding a bundler alias, an import
condition override, or any other application-local shim. Inlining removes the
"mixed Zod entry point" hazard in which a consumer's bundler would otherwise
resolve the SDK's internal `zod/v4` import to a different physical Zod copy than
the one the schemas were constructed against.

Schema validation adapts to the host runtime. On Node the packages compile JSON
Schema draft-07 with Ajv. Cloudflare Workers use `@cfworker/json-schema`, which
validates the same dialect without code generation; other runtimes that reject
`new Function` use that fallback as well. Both engines reject malformed schemas
at registration time and normalize errors to the same shape, so protocol
behavior and error envelopes are unchanged.

Cloudflare deployments must enable the `nodejs_compat` compatibility flag.
The self-contained bundles still use Node built-ins required by the official
MCP SDK, including `node:crypto`; the package does not shim those platform APIs.

`@mcpfn/client`, `@mcpfn/cli`, `@mcpfn/testing`, and `@mcpfn/inspector` remain
Node-targeted. `@mcpfn/client` re-exports the stdio client transport, which
depends on `child_process`; it is not offered as an edge bundle. Edge consumers
serve MCP with `@mcpfn/core` and, when they need OAuth resource-server behavior,
`@mcpfn/auth`.

A representative Cloudflare Worker startup check is part of the guarded release.
`npm run gate:mcpfn-release` bundles a worker that imports `@mcpfn/core` and
`@mcpfn/auth` next to a root `zod`, boots it under the `workerd` runtime with
`nodejs_compat`, asserts that the edge validator was selected, and drives a
real authenticated MCP client through `initialize`, `tools/list`, and both
valid and invalid `tools/call` requests. The check also asserts, from the
bundler's module graph, that no external `zod/v4` or SDK entry leaks into the
worker bundle.

## Public format policy

Manifests, scenario artifacts, scenario reports, target-suite reports, and
client events use integer `formatVersion: 1`. Inspector snapshots use
`formatVersion: 2`; version 2 removes the version 1 `state` field and replaces
it with the unambiguous `clientState` field. Snapshot readers must reject the
unknown major version until they migrate to `clientState`; no dual-field
compatibility representation is emitted. Additive optional fields are
compatible within a major format version, while removing or changing field
meaning requires the next version. Individual legacy scenario arrays remain
readable during the 0.x migration, but exporters write version 1 records or
artifacts.

Diagnostic event phase/outcome/code values and client event kinds are stable
machine-readable identifiers. New identifiers and optional fields are
additive. Renaming or removing an identifier requires a package minor release,
a migration note, and a compatibility test during 0.x.

Encrypted OAuth records are written in a version 1 envelope. Readers accept
the earlier unenveloped encrypted JSON representation, then rewrite it in the
version 1 envelope on the next save. Memory stores are process-local and need
no persistence migration. Inspector exports use secret variable references;
raw credential values are never an artifact feature.

## Optional AuthFn integration

The provider adapter is structurally typed in `@mcpfn/auth`. AuthFn is an
optional peer and development dependency, not a runtime dependency of the base
package. Identity, login, consent, signing, durable client/code/token state,
and business authorization stay in the provider. McpFn owns MCP discovery,
registration normalization, redirect/state/resource/PKCE policy, token request
parsing, client method negotiation, refresh serialization, revocation routing,
and OAuth error envelopes.

## Shared primitives and single writers

PKCE generation and derivation, state generation, credential redaction, and
encrypted storage interfaces come from shared Superfunctions OAuth packages.
McpFn-specific code is limited to MCP discovery and interoperability policy.

`@mcpfn/datafn` is the named in-repository downstream consumer for the first
release. Its registry is the only MCP projection and its configured DataFn
executor is the only query/mutation writer; there is no HTTP or alternate
fallback. The calculator example is the named generic client/server smoke.
LangFn and Skillplane are not present on this base and require their own later
parity and deployment evidence before migration.

## Evidence boundaries

The release gate proves the checked-out workspace, temporary tarballs, an
external installed consumer, deterministic provider-shaped fixtures, and the
pinned official conformance runner. It does not prove npm registry publication,
provider-controlled configuration, a downstream branch, or production
deployment. Those claims require separately recorded evidence for the exact
published version or deployed revision.
