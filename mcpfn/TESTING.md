# Testing and CI

A regression-free MCP project needs five independent layers.

| Layer | What it catches | McpFn surface |
| --- | --- | --- |
| Unit/domain | Handler logic, authorization, persistence, policy | Existing package tests |
| Contract | Tools, resources, prompts, tasks, extensions, host requirements | Hashed manifest plus `mcpfn diff` |
| Semantic protocol | Real client/server calls and stable business envelopes | `@mcpfn/testing` scenarios |
| Authentication | API keys, OAuth challenges, scopes, audience, expiry, revocation, PKCE, refresh, and client metadata | `@mcpfn/testing/auth` and `@mcpfn/testing/playwright` |
| Protocol conformance | Initialization, JSON-RPC, transport, and MCP specification behavior | Official `@modelcontextprotocol/conformance` via `mcpfn conformance` |

## Contract baseline

Generate a candidate manifest from a module whose default export is a `McpFnServer`, an async factory returning one, a `McpFnRegistry`, or an existing manifest:

```sh
mcpfn manifest ./mcp-server.ts --output ./candidate.manifest.json
mcpfn diff ./mcpfn.manifest.json ./candidate.manifest.json --fail-on-behavioral
```

For a registry export, pass both `--name` and `--version`. Exit code `1` means the diff found a breaking change, or a behavioral change when requested. Exit code `2` means the source or command was invalid.

Review additive changes before replacing the committed baseline. A compatible diff means old inputs remain structurally accepted; it does not prove the new tool is authorized or semantically correct.

## Semantic scenarios

```ts
import type { McpFnScenario } from "@mcpfn/testing";

export default [
  {
    name: "resolves the published version",
    tool: "skill_get",
    arguments: { slug: "work-linear-issue" },
    expect: {
      isError: false,
      structuredContent: {
        skill: { slug: "work-linear-issue", version: 3 },
      },
      structuredTextParity: true,
    },
  },
] satisfies McpFnScenario[];
```

`mcpfn test` connects an official client and server with the official in-memory transport. It checks tool, resource-template, prompt, and static-resource contracts against the manifest and then runs scenarios serially. `McpFnTestClient` also exposes resources, prompts, completions, subscriptions, and experimental task APIs; its `configure` hook installs client-side roots, sampling, elicitation, and notification handlers before initialization.

`structuredTextParity` is appropriate only when the text block is JSON representing the same object as `structuredContent`. Human-readable text such as MemoryFn's search summary should be asserted separately.

For tools with a declared success `outputSchema`, assert error codes by parsing the JSON text block: McpFn intentionally omits structured error content so it cannot be rejected against the success schema.

## Authentication

`assertAuthRegressionSuite()` runs the transport-level API-key or OAuth matrix against a caller-provided protected operation. The thin provider adapter maps credential issuance and revocation to the application's existing test support. OAuth runs can enable scope, expiry, resource binding, and revocation capabilities; resource-binding coverage rejects both missing and incorrect resource indicators, and every rejected OAuth request is checked for a protected-resource `WWW-Authenticate` challenge.

The `@mcpfn/testing/playwright` subpath exports a Playwright `test` extended with `mcpfnOAuth`. Its local server supports authorization-code + PKCE, consent approval and denial, callback capture, one-time codes, refresh rotation, revocation, discovery, client metadata variants, and access-token verification. The extension-grant variants verify that an authorization server accepts a compatible authorization-code client even when its metadata advertises additional JWT-bearer, device-code, or custom grants. Actual unsupported token requests must still return `unsupported_grant_type`.

Keep application-specific UI selectors, real-provider secrets, workspace authorization, and least-privilege assertions in the application repository. McpFn owns the reusable protocol and credential-lifecycle mechanics.

## Official conformance

Start a real Streamable HTTP endpoint, then run:

```sh
mcpfn conformance http://127.0.0.1:3000/mcp --suite active
```

McpFn delegates to the pinned official conformance npm package and returns its exit code. The current pinned runner requires Node.js 22 or newer. Use an expected-failures file only for reviewed, time-bounded exceptions; do not turn new failures into a silent baseline update.

## Superfunctions release gate

```sh
npm run gate:mcpfn-release
```

The gate typechecks, tests, and builds all five McpFn packages; runs OAuth boundary tests, a real Chromium PKCE flow, and the official active conformance suite; runs the complete DataFn server suite; exercises the real CLI against the checked-in calculator server, manifest, and scenarios; and checks package contents. LangFn, MemoryFn, and ProbeFn are not covered by this release gate.

CI routes a change set made entirely of the McpFn runtime, its DataFn adapter, README, and release metadata through this dedicated Node.js 22 gate. Root package manifests, lockfiles, CI workflows, and the CI planner always run the repository's generic JavaScript job as well as the McpFn gate. This conservative boundary prevents unrelated global changes from gaining coverage merely by being included with McpFn work.

When publishing manually, release `@mcpfn/core` and `@mcpfn/auth` first, followed by `@mcpfn/testing`, `@mcpfn/datafn`, and `@mcpfn/cli`. The repository's package release workflow publishes one selected package at a time; it does not infer dependency order.
