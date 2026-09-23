#!/usr/bin/env node

// Representative Cloudflare Workers (workerd) startup + tool-call regression for
// McpFn. It bundles a Worker that imports the built @mcpfn/core and @mcpfn/auth
// alongside a root `zod` import (the mixed-entry-point shape that broke
// Skillplane), boots it under workerd via Miniflare, and drives a real MCP
// client through the authenticated endpoint.
//
// This gate would fail on the pre-fix behavior in two ways:
//   1. The published bundle leaked a `zod/v4` entry point next to the consumer's
//      root `zod`, which esbuild could initialize out of order and throw
//      `TypeError: Class2 is not a constructor` at workerd startup.
//   2. Tool/prompt registration compiled JSON Schemas with Ajv, whose runtime
//      `new Function` is forbidden by workerd, so any tool-serving Worker failed.
//
// A dry-run bundle is not enough: the failures only appear once workerd actually
// executes the Worker, so this test starts it and exercises tools/call.

import assert from "node:assert/strict";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Cloudflare's `nodejs_compat` provides Node built-ins at runtime; keep them
// external at bundle time exactly as Wrangler does.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "cloudflare:workers",
];

const workerSource = `
import { z } from "zod";
import {
  McpFnRegistry,
  createMcpFnServer,
  schemaEngine,
  structuredResult,
  validateManifest,
} from "@mcpfn/core";
import {
  createOAuthResourceServerHandler,
  createProtectedResourceMetadata,
} from "@mcpfn/auth";

// A consumer that also uses root \`zod\` — the mixed-entry-point shape.
const AddInput = z.object({ left: z.number(), right: z.number() });
const resource = new URL("https://worker.example/mcp");
const protectedResource = createProtectedResourceMetadata({
  resource,
  authorizationServers: ["https://auth.example"],
  scopesSupported: ["tools:call"],
});

let unresolvedReferenceRejection;
try {
  new McpFnRegistry().register({
    name: "invalid-reference",
    description: "Must fail during Worker module startup.",
    inputSchema: {
      type: "object",
      properties: { value: { $ref: "https://worker.example/schemas/missing" } },
    },
    handler: async () => structuredResult({ ok: true }),
  });
} catch (error) {
  const cause = error?.details?.cause;
  unresolvedReferenceRejection = {
    rejected: true,
    cause: typeof cause === "string" ? cause : String(error),
  };
}

const registry = new McpFnRegistry().register({
  name: "pair-shape",
  description: "Validate a pair of numbers.",
  inputSchema: {
    $id: "https://worker.example/schemas/pair",
    type: "object",
    additionalProperties: false,
    required: ["left", "right"],
    properties: { left: { type: "number" }, right: { type: "number" } },
  },
  handler: async ({ left, right }) => structuredResult({ left, right }),
}).register({
  name: "add",
  description: "Add two numbers.",
  inputSchema: {
    type: "object",
    $ref: "https://worker.example/schemas/pair",
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["result"],
    properties: { result: { type: "number" } },
  },
  handler: async ({ left, right }) => {
    // Prove the consumer's root zod runs in the same isolate.
    AddInput.parse({ left, right });
    return structuredResult({ result: left + right });
  },
}).register({
  name: "opaque-uri",
  description: "Validate a relative reference beneath a URN schema ID.",
  inputSchema: {
    $id: "urn:example:root",
    type: "object",
    required: ["value"],
    $defs: { child: { $id: "child", type: "string" } },
    properties: { value: { $ref: "child" } },
  },
  handler: async ({ value }) => structuredResult({ value }),
}).register({
  name: "ipvfuture-uri",
  description: "Validate a relative reference beneath an IPvFuture schema ID.",
  inputSchema: {
    $id: "https://[v1.fe]/schema",
    type: "object",
    required: ["value"],
    $defs: { child: { $id: "child", type: "string" } },
    properties: { value: { $ref: "child" } },
  },
  handler: async ({ value }) => structuredResult({ value }),
}).register({
  name: "recursive",
  description: "Validate an anonymous dot-segment self reference.",
  inputSchema: { type: "object", properties: { child: { $ref: "." } } },
  handler: async (args) => structuredResult(args),
});

const mcp = createMcpFnServer({
  info: { name: "cloudflare-regression", version: "1.0.0" },
  registry,
});
const manifest = validateManifest(mcp.manifest());

const handlerPromise = mcp.createWebStandardHandler({
  enableJsonResponse: true,
  sessionIdGenerator: () => crypto.randomUUID(),
});
const protectedHandlerPromise = handlerPromise.then((handler) =>
  createOAuthResourceServerHandler(handler, {
    resource,
    authorizationServers: ["https://auth.example"],
    requiredScopes: ["tools:call"],
    verifier: {
      async verifyAccessToken(token) {
        return {
          token,
          clientId: "cloudflare-regression-client",
          scopes: ["tools:call"],
          resource,
        };
      },
    },
  }),
);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/diagnostics") {
      return Response.json({
        schemaEngine,
        protectedResource,
        manifestHash: manifest.hash,
        unresolvedReferenceRejection,
      });
    }
    if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
    const handler = await protectedHandlerPromise;
    return handler(request);
  },
};
`;

async function bundleWorker() {
  const result = await build({
    stdin: {
      contents: workerSource,
      resolveDir: repoRoot,
      sourcefile: "cloudflare-regression-worker.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser", "import"],
    external: nodeExternals,
  });
  return { code: result.outputFiles[0].text, metafile: result.metafile };
}

function assertSelfContainedZod(metafile) {
  const inputs = Object.keys(metafile.inputs);

  // The published @mcpfn/core inlines the MCP SDK and its Zod runtime, so the
  // Worker graph must never pull in the SDK's `zod/v4` entry point. If it did,
  // the consumer's root `zod` and the SDK's `zod/v4` would be two entry points
  // over the same package — the ordering hazard that throws
  // `Class2 is not a constructor` at workerd startup.
  const zodV4Inputs = inputs.filter((input) => /(^|\/)zod\/v4\//.test(input));
  assert.deepEqual(
    zodV4Inputs,
    [],
    `Worker graph leaked a separate zod/v4 entry point: ${zodV4Inputs.join(", ")}`,
  );

  // The SDK itself must be inlined into the built package, not resolved from the
  // consumer's node_modules at bundle time.
  const sdkInputs = inputs.filter((input) => /@modelcontextprotocol\/sdk\//.test(input));
  assert.deepEqual(
    sdkInputs,
    [],
    `Worker graph pulled the MCP SDK directly instead of the inlined bundle: ${sdkInputs.join(", ")}`,
  );
}

async function main() {
  const { code, metafile } = await bundleWorker();
  assertSelfContainedZod(metafile);

  const mf = new Miniflare({
    port: 0,
    compatibilityDate: "2026-09-13",
    compatibilityFlags: ["nodejs_compat"],
    modules: [{ type: "ESModule", path: "worker.js", contents: code }],
  });

  try {
    const url = await mf.ready; // workerd is up and the module has been evaluated.
    const endpoint = new URL("/mcp", url);
    const diagnosticsResponse = await fetch(new URL("/diagnostics", url));
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(
      diagnostics.schemaEngine,
      "cfworker",
      `Worker selected ${diagnostics.schemaEngine} instead of the edge validator`,
    );
    assert.match(diagnostics.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal(
      diagnostics.unresolvedReferenceRejection?.rejected,
      true,
      "Worker accepted an unresolved schema reference during module startup",
    );
    assert.match(
      diagnostics.unresolvedReferenceRejection.cause,
      /resolve.*ref/i,
      "Worker rejected the invalid schema for an unexpected reason",
    );
    assert.deepEqual(diagnostics.protectedResource, {
      resource: "https://worker.example/mcp",
      authorization_servers: ["https://auth.example"],
      scopes_supported: ["tools:call"],
      bearer_methods_supported: ["header"],
    });

    const client = new Client({ name: "cloudflare-regression-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { authorization: "Bearer worker-test-token" } },
    });
    await client.connect(transport);

    const { tools } = await client.listTools();
    assert.ok(
      tools.some((tool) => tool.name === "add"),
      "Worker did not advertise the 'add' tool",
    );

    const result = await client.callTool({ name: "add", arguments: { left: 2, right: 3 } });
    assert.deepEqual(
      result.structuredContent,
      { result: 5 },
      `Unexpected tool result: ${JSON.stringify(result)}`,
    );

    const invalid = await client.callTool({
      name: "add",
      arguments: { left: "2", right: 3 },
    });
    assert.equal(invalid.isError, true, "Worker accepted invalid tool arguments");
    assert.match(
      invalid.content[0]?.text ?? "",
      /MCPFN_INVALID_ARGUMENTS/,
      `Unexpected validation result: ${JSON.stringify(invalid)}`,
    );

    const opaque = await client.callTool({ name: "opaque-uri", arguments: { value: "ok" } });
    assert.deepEqual(opaque.structuredContent, { value: "ok" });
    const opaqueInvalid = await client.callTool({ name: "opaque-uri", arguments: { value: 42 } });
    assert.equal(opaqueInvalid.isError, true, "Worker accepted an invalid opaque-URI value");
    const ipvFuture = await client.callTool({ name: "ipvfuture-uri", arguments: { value: "ok" } });
    assert.deepEqual(ipvFuture.structuredContent, { value: "ok" });
    const ipvFutureInvalid = await client.callTool({ name: "ipvfuture-uri", arguments: { value: 42 } });
    assert.equal(ipvFutureInvalid.isError, true, "Worker accepted an invalid IPvFuture value");
    const recursive = await client.callTool({ name: "recursive", arguments: { child: { child: {} } } });
    assert.deepEqual(recursive.structuredContent, { child: { child: {} } });
    const recursiveInvalid = await client.callTool({ name: "recursive", arguments: { child: 42 } });
    assert.equal(recursiveInvalid.isError, true, "Worker accepted an invalid recursive value");

    await client.close();
    process.stdout.write(
      JSON.stringify({
        ok: true,
        gate: "mcpfn cloudflare worker startup",
        runtime: "workerd",
        schemaEngine: diagnostics.schemaEngine,
        auth: "@mcpfn/auth",
        tool: "add",
        result: 5,
        opaqueUri: true,
        ipvFutureUri: true,
        recursiveUri: true,
      }) + "\n",
    );
  } finally {
    await mf.dispose();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  );
  process.exitCode = 1;
}
