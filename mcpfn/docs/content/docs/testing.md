---
title: Test and evolve a server
description: Manifests, client profiles, semantic scenarios, authentication, and protocol conformance.
---

# Test and evolve a server

Use independent checks for domain behavior, public contract changes, effective authenticated catalogs, protocol semantics, authorization, and wire conformance. A green manifest diff does not prove a handler's business behavior; a scenario does not prove a new host supports every client requirement.

## Compare the public contract

Generate and review a candidate manifest from a server module or registry, then compare it with the committed baseline:

```sh
mcpfn manifest ./src/mcp/server.ts --output ./candidate.manifest.json
mcpfn validate ./candidate.manifest.json
mcpfn diff ./mcpfn.manifest.json ./candidate.manifest.json --fail-on-behavioral
```

The manifest records tools, resources, templates, prompts, tasks, extensions, client requirements, protocol version, and transports. Exit code 1 denotes a rejected compatibility diff; exit code 2 denotes an invalid source or command. Review additive changes before updating a baseline.

## Run semantic scenarios

`@mcpfn/testing` uses the production client over the official SDK's in-memory or real target transports. A scenario can assert tool results, resource or prompt behavior, or an inventory shape. Run local modules with `mcpfn test` or arbitrary stdio/HTTP MCP servers with `mcpfn test-target`:

```sh
mcpfn test ./src/mcp/server.ts ./tests/mcp.scenarios.ts --output ./mcpfn-report.json
mcpfn test-target https://api.example.com/mcp ./tests/mcp.scenarios.ts \
  --bearer-token-env MCP_TOKEN --junit ./mcpfn-report.xml
```

Keep credentials in named environment variables. Reports and inspector exports are redacted and size-bounded. Client-profile snapshots exercise effective catalogs and trusted argument enrichment through the production session; use `mcpfn validate-profile`, `diff-profiles`, and `test-profiles` when profiles are configured.

## Check authorization and conformance

`@mcpfn/testing/auth` covers missing, invalid, valid, insufficient-scope, expired, wrong-resource, and revoked credentials. `@mcpfn/testing/playwright` exercises a real browser authorization-code and PKCE flow, callback capture, refresh, and revocation. Applications supply their own product authorization assertions.

For a running Streamable HTTP endpoint, use the pinned official runner:

```sh
mcpfn conformance http://127.0.0.1:3000/mcp --suite active
```

Conformance requires Node.js 22 or newer. The [full testing and CI reference](/docs/reference/testing-and-ci) covers profile fixtures, scenario format, proof levels, and the repository release gate.
