#!/usr/bin/env node

import { McpFnTestClientCleanupError } from "@mcpfn/testing";

import { MCPFN_CLI_EXIT_TEST_FAILURE, runCli } from "./index.js";

void runCli(process.argv.slice(2))
  .then((exitCode) => {
    if (exitCode !== 0) process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    // runCli retains retryable cleanup ownership for library callers. A CLI
    // process has no such caller, so do not leave a live transport handle
    // waiting on the event loop after the bounded retry fails.
    if (error instanceof McpFnTestClientCleanupError) {
      process.exit(MCPFN_CLI_EXIT_TEST_FAILURE);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
