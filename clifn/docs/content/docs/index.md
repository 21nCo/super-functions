---
title: CliFn documentation
description: Build reliable command-line tools with parser-agnostic primitives.
---

`@clifn/core` is a Node.js toolkit for the concerns that recur across command-line applications. It supplies an action runner, text and JSON output, configuration and environment readers, credential storage, an authenticated HTTP client, prompts, JSON stdio, subprocess execution, scaffolding, and diagnostics. Your CLI owns its commands, parser, and product behavior.

## Start here

- [Getting started](/docs/getting-started): install the package and run an action.
- [Build a CLI](/docs/cli-builder): connect your parser to `runAction()` and set exit status.
- [Output and diagnostics](/docs/output-and-diagnostics): human and machine-readable results.
- [Configuration](/docs/configuration): config modules, JSON project settings, and environment values.
- [Credentials and HTTP](/docs/credentials-and-client): profile persistence and safe request retries.
- [Automation](/docs/automation): subprocesses and bounded file generation.
- [Interaction and stdio](/docs/interaction-and-stdio): prompts, terminal helpers, and JSON pipes.

## Public entry points

Import from documented subpaths such as `@clifn/core/runner`, `@clifn/core/output`, or `@clifn/core/credentials`. The [export reference](/docs/reference/exports) lists all thirteen public subpaths and their principal functions and types. `@clifn/core` itself also exports the shared surface. Avoid importing internal `dist/*` paths.
