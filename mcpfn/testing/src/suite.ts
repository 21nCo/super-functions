import type { Implementation, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { McpFnTarget, McpFnTargetDescriptor } from "@mcpfn/client";
import type { McpFnManifest } from "@mcpfn/core";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import { assertManifestContract } from "./assertions.js";
import { McpFnTestClient, type McpFnTestClientOptions } from "./client.js";
import {
  runScenarios,
  type McpFnScenario,
  type McpFnScenarioResult,
} from "./scenarios.js";

export interface RunMcpFnTargetSuiteOptions {
  target: McpFnTarget;
  scenarios?: McpFnScenario[];
  manifest?: McpFnManifest;
  expectedToolNames?: readonly string[];
  clientInfo?: Implementation;
  client?: McpFnTestClientOptions;
}

export interface McpFnTargetSuiteReport {
  ok: boolean;
  target: McpFnTargetDescriptor;
  server?: Implementation;
  capabilities?: ServerCapabilities;
  manifestChecked: boolean;
  total: number;
  passed: number;
  failed: number;
  results: McpFnScenarioResult[];
}

/** Runs local, stdio, HTTP, or custom targets through the production session engine. */
export async function runMcpFnTargetSuite(
  options: RunMcpFnTargetSuiteOptions,
): Promise<McpFnTargetSuiteReport> {
  const client = await McpFnTestClient.connectTarget(
    options.target,
    options.clientInfo ?? { name: "mcpfn-suite", version: "0.0.1" },
    options.client,
  );
  try {
    if (options.manifest) {
      await assertManifestContract(client, options.manifest, {
        expectedToolNames: options.expectedToolNames,
      });
    }
    const results = await runScenarios(client, options.scenarios ?? []);
    const failed = results.filter((result) => result.status === "failed").length;
    return {
      ok: failed === 0,
      target: redactOAuthValue(options.target.describe()),
      server: client.session.getServerVersion(),
      capabilities: client.session.getServerCapabilities(),
      manifestChecked: Boolean(options.manifest),
      total: results.length,
      passed: results.length - failed,
      failed,
      results,
    };
  } finally {
    await client.close();
  }
}
