#!/usr/bin/env node

import {
  McpFnConformanceCleanupError,
  McpFnTargetSuiteArtifactCleanupError,
  McpFnTargetSuiteCleanupError,
  McpFnTestClientCleanupError,
} from "@mcpfn/testing";

import {
  MCPFN_CLI_EXIT_TEST_FAILURE,
  McpFnInspectorCleanupError,
  runCli,
} from "./index.js";

void runCli(process.argv.slice(2))
  .then((exitCode) => {
    if (exitCode !== 0) process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    // runCli retains retryable cleanup ownership for library callers. A CLI
    // process has no such caller, so do not leave a live transport handle
    // waiting on the event loop after the bounded retry fails.
    if (
      error instanceof McpFnTestClientCleanupError ||
      error instanceof McpFnTargetSuiteArtifactCleanupError ||
      error instanceof McpFnTargetSuiteCleanupError ||
      error instanceof McpFnConformanceCleanupError ||
      error instanceof McpFnInspectorCleanupError
    ) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`, () => {
        process.exit(MCPFN_CLI_EXIT_TEST_FAILURE);
      });
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
