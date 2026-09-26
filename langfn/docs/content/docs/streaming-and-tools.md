---
title: Streaming and tools
description: Handle cancellation, tool policy, and network boundaries.
---

# Streaming and tools

LangFn exposes streaming model operations and a tool abstraction with JSON-schema definitions, policy checks, and execution context. Built-in tools include calculator, `api_call`, web search, and code execution. Tool authority and network access are host responsibilities; do not let untrusted model text choose privileged credentials or policy exceptions.

`api_call` permits public IPv4 literals by default. Hostnames and IPv6 literals require an explicit `allowedHosts` entry because portable fetch cannot validate and pin DNS results across Node and Workers. That allowlist trusts all addresses a hostname resolves to. `allowPrivateNetwork: true` is a broader opt-in. Redirects and URLs with embedded credentials are rejected. Use an egress proxy for dynamic hostname access.

Streaming HTTP responses cancel model work when clients disconnect. Configured retry signals remain active unless a per-call cancellation token overrides them. Read the [release gate contract](/docs/reference/release-gate) for these boundaries and the [tool source](https://github.com/21nCo/super-functions/tree/dev/langfn/typescript/src/tools) for concrete APIs.
