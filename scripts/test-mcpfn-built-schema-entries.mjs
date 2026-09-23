// Run with --disallow-code-generation-from-strings after @mcpfn/core is built.
// Vitest and workerd bundle CommonJS imports, while this checks native package
// entrypoints with the fallback engine selected before module loading.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const entry = process.argv[2];
assert.ok(entry === "esm" || entry === "cjs", "Choose the ESM or CJS entry");
const core = entry === "esm"
  ? await import("@mcpfn/core")
  : createRequire(import.meta.url)("@mcpfn/core");
assert.equal(core.schemaEngine, "cfworker");

const registry = new core.McpFnRegistry();
for (const [name, id] of [
  ["opaque", "urn:example:root"],
  ["ipvfuture", "https://[v1.fe]/schema"],
]) {
  registry.register({
    name,
    description: `Validate ${name} schema references`,
    inputSchema: {
      $id: id,
      type: "object",
      required: ["value"],
      $defs: { child: { $id: "child", type: "string" } },
      properties: { value: { $ref: "child" } },
    },
    handler: async ({ value }) => ({ content: [{ type: "text", text: value }] }),
  });
  const valid = await registry.callTool(name, { value: "ok" }, undefined, {});
  assert.deepEqual(valid.content, [{ type: "text", text: "ok" }]);
  await assert.rejects(
    registry.callTool(name, { value: 42 }, undefined, {}),
    /Invalid arguments/,
  );
}
registry.register({
  name: "recursive",
  description: "Validate an anonymous dot-segment self reference",
  inputSchema: { type: "object", properties: { child: { $ref: "." } } },
  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
});
assert.deepEqual(
  (await registry.callTool("recursive", { child: { child: {} } }, undefined, {})).content,
  [{ type: "text", text: "ok" }],
);
await assert.rejects(
  registry.callTool("recursive", { child: 42 }, undefined, {}),
  /Invalid arguments/,
);
registry.register({
  name: "fragment",
  description: "Validate a named fragment beneath an anonymous root",
  inputSchema: {
    type: "object",
    definitions: { value: { $id: "#value", type: "string" } },
    properties: { value: { $ref: "#value" } },
  },
  handler: async ({ value }) => ({ content: [{ type: "text", text: value }] }),
});
assert.deepEqual(
  (await registry.callTool("fragment", { value: "ok" }, undefined, {})).content,
  [{ type: "text", text: "ok" }],
);
await assert.rejects(
  registry.callTool("fragment", { value: 42 }, undefined, {}),
  /Invalid arguments/,
);
console.log(JSON.stringify({ entry, engine: core.schemaEngine, valid: true, invalidRejected: true }));
